'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

var KEY = 'iptvnator-tv:title-facts';
var LOG = { error: function () {} };

function facts(stored) {
    return load(['title-facts.js'], stored, { Log: LOG });
}

function counting(env) {
    var reads = { n: 0 };
    var get = env.globals.localStorage.getItem;
    env.globals.localStorage.getItem = function (key) { reads.n++; return get(key); };
    return reads;
}

test('#91 a film\'s length and a show\'s seasons are kept per source and survive a restart', function () {
    var env = facts();
    var api = env.globals.TitleFacts;
    api.save('s1', 'movies', { stream_id: 7 }, { minutes: 111.6 });
    api.save('s1', 'series', { series_id: 3 }, { seasons: 4 });
    api.save('s1', 'movies', { stream_id: 8 }, { minutes: 0 });
    assert.deepEqual(JSON.parse(JSON.stringify(api.get('s1', 'movies', { stream_id: 7 }))), { minutes: 112 });
    assert.equal(api.get('s1', 'series', { series_id: 3 }).seasons, 4);
    assert.equal(api.get('s2', 'movies', { stream_id: 7 }), null);
    assert.equal(api.get('s1', 'movies', { stream_id: 8 }), null, 'nothing useful, nothing kept');
    api.flush();
    var again = facts(env.stored).globals.TitleFacts;
    assert.equal(again.get('s1', 'movies', { stream_id: 7 }).minutes, 112);
});

test('#91 the boxes read storage once, however often they ask', function () {
    var env = facts({ [KEY]: JSON.stringify({ order: ['s1|movies|7'], facts: { 's1|movies|7': { minutes: 90 } } }) });
    var reads = counting(env);
    for (var i = 0; i < 50; i++) env.globals.TitleFacts.get('s1', 'movies', { stream_id: 7 });
    assert.equal(reads.n, 1);
});

test('#91 only the last 2000 titles are kept, and a removed source\'s titles go', function () {
    var env = facts();
    var api = env.globals.TitleFacts;
    for (var i = 0; i < 2005; i++) api.save('s1', 'movies', { stream_id: i }, { minutes: 90 });
    assert.equal(api.get('s1', 'movies', { stream_id: 4 }), null);
    assert.equal(api.get('s1', 'movies', { stream_id: 5 }).minutes, 90);
    api.flush();
    assert.equal(JSON.parse(env.stored[KEY]).order.length, 2000);
    api.save('s2', 'series', { series_id: 1 }, { seasons: 2 });
    api.forget('s1');
    assert.equal(api.get('s1', 'movies', { stream_id: 2004 }), null);
    assert.equal(api.get('s2', 'series', { series_id: 1 }).seasons, 2);
    api.flush();
    assert.deepEqual(JSON.parse(env.stored[KEY]).order, ['s2|series|1']);
});

test('#91 a box takes the list item\'s length, then the kept one, then TMDB\'s; seasons likewise after the loaded episodes', function () {
    var tmdb = { runtime: 112, number_of_seasons: 5 };
    var env = load(['title-facts.js', 'box-cards.js'], {}, {
        Log: LOG,
        Tmdb: { year: function () { return ''; }, cached: function () { return tmdb; } },
    });
    var api = env.globals.BoxCards;
    var kept = env.globals.TitleFacts;
    assert.equal(api.facts({ stream_id: 1, name: 'Film' }, 'movies', null, 's1').length, '1 h 52 min');
    kept.save('s1', 'movies', { stream_id: 1 }, { minutes: 95 });
    assert.equal(api.facts({ stream_id: 1, name: 'Film' }, 'movies', null, 's1').length, '1 h 35 min');
    assert.equal(api.facts({ stream_id: 1, name: 'Film', duration_secs: 3600 }, 'movies', null, 's1').length, '1 h 0 min');
    assert.equal(api.facts({ stream_id: 1, name: 'Film' }, 'movies', null, 's2').length, '1 h 52 min', 'another source keeps its own');
    assert.equal(api.facts({ series_id: 2, name: 'Show' }, 'series', null, 's1').seasons, '5 seasons');
    kept.save('s1', 'series', { series_id: 2 }, { seasons: 3 });
    assert.equal(api.facts({ series_id: 2, name: 'Show' }, 'series', null, 's1').seasons, '3 seasons');
    assert.equal(api.facts({ series_id: 2, name: 'Show' }, 'series', { episodes: [{ season: 1 }, { season: 2 }] }, 's1').seasons, '2 seasons');
    assert.equal(api.seasonCount({ episodes: [{ season: 1 }, { season: 1 }, { season: 4 }] }), 2);
});

function lookup(answers, options) {
    var asked = [];
    var redraws = { n: 0 };
    var env = load(['title-facts.js', 'box-cards.js', 'box-lookup.js'], {}, {
        Log: LOG,
        KidsProfile: { on: function () { return !!(options && options.kids); } },
        Tmdb: {
            year: function () { return ''; },
            cached: function () { return null; },
            enabled: function () { return !(options && options.off); },
            throttled: function () { return 0; },
            lookup: function (item, type) {
                asked.push(type + ':' + item.name);
                var body = answers[item.name];
                return Promise.resolve(body ? { status: 'found', body: body } : { status: 'none' });
            },
        },
    });
    var boxes = env.globals.BoxLookup({ sourceId: function () { return 's1'; }, redraw: function () { redraws.n++; } });
    return { env: env, boxes: boxes, asked: asked, redraws: redraws };
}

function settle() {
    return new Promise(function (resolve) { setTimeout(resolve, 250); });
}

test('#91 the boxes on screen ask TMDB once each, keep the answers and draw again', async function () {
    var made = lookup({ A: { runtime: 100 }, B: { runtime: 80 }, S: { number_of_seasons: 6 } });
    var films = [{ stream_id: 1, name: 'A' }, { stream_id: 2, name: 'B' }, { stream_id: 3, name: 'C', duration_secs: 600 }, { stream_id: 4, name: 'Set', sub: '3 films' }];
    made.boxes.want(films, 'movies');
    made.boxes.want(films, 'movies');
    made.boxes.want([{ series_id: 9, name: 'S' }], 'series');
    await settle();
    assert.deepEqual(made.asked.sort(), ['movie:A', 'movie:B', 'tv:S']);
    var kept = made.env.globals.TitleFacts;
    assert.equal(kept.get('s1', 'movies', films[0]).minutes, 100);
    assert.equal(kept.get('s1', 'series', { series_id: 9 }).seasons, 6);
    assert.ok(made.redraws.n >= 1);
    made.boxes.want(films, 'movies');
    await settle();
    assert.equal(made.asked.length, 3, 'known titles are not asked again');
});

test('#91 no TMDB, the Kids profile, Live TV or another source\'s titles: nothing is asked', async function () {
    for (var options of [{ off: true }, { kids: true }]) {
        var made = lookup({}, options);
        made.boxes.want([{ stream_id: 1, name: 'A' }], 'movies');
        await settle();
        assert.deepEqual(made.asked, []);
    }
    var other = lookup({});
    other.boxes.want([{ stream_id: 1, name: 'A', sourceId: 's2' }], 'movies');
    other.boxes.want([{ stream_id: 2, name: 'Channel' }], 'live');
    await settle();
    assert.deepEqual(other.asked, []);
});

test('#91 answers arriving together are written once, a second later, not once each', async function () {
    var env = facts();
    var writes = { n: 0 };
    var set = env.globals.localStorage.setItem;
    env.globals.localStorage.setItem = function (key, value) { if (key === KEY) writes.n++; set(key, value); };
    var api = env.globals.TitleFacts;
    for (var i = 0; i < 50; i++) api.save('s1', 'movies', { stream_id: i }, { minutes: 90 });
    assert.equal(writes.n, 0);
    await new Promise(function (resolve) { setTimeout(resolve, 1100); });
    assert.equal(writes.n, 1);
    assert.equal(JSON.parse(env.stored[KEY]).order.length, 50);
});

test('#91 a title TMDB cannot size is noted, kept across a restart, and not asked again for 30 days', async function () {
    var made = lookup({ A: { runtime: 0 } });
    made.boxes.want([{ stream_id: 1, name: 'A' }, { stream_id: 2, name: 'Nowhere' }], 'movies');
    await settle();
    assert.deepEqual(made.asked.sort(), ['movie:A', 'movie:Nowhere']);
    var kept = made.env.globals.TitleFacts;
    assert.equal(kept.missedLately('s1', 'movies', { stream_id: 1 }), true);
    assert.equal(kept.get('s1', 'movies', { stream_id: 1 }), null);
    kept.flush();
    // After a restart (a new BoxLookup over the saved facts) neither is asked.
    var restarted = load(['title-facts.js', 'box-cards.js', 'box-lookup.js'], made.env.stored, {
        Log: LOG,
        KidsProfile: { on: function () { return false; } },
        Tmdb: { year: function () { return ''; }, cached: function () { return null; }, enabled: function () { return true; }, throttled: function () { return 0; },
            lookup: function (item) { made.asked.push('again:' + item.name); return Promise.resolve({ status: 'none' }); } },
    });
    restarted.globals.BoxLookup({ sourceId: function () { return 's1'; }, redraw: function () {} }).want([{ stream_id: 1, name: 'A' }, { stream_id: 2, name: 'Nowhere' }], 'movies');
    await settle();
    assert.equal(made.asked.length, 2);
    // A later answer with the number replaces the note.
    kept.save('s1', 'movies', { stream_id: 1 }, { minutes: 95 });
    assert.equal(kept.missedLately('s1', 'movies', { stream_id: 1 }), false);
});