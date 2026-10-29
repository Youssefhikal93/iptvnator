'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

// Values from the sandbox's realm, compared as plain data.
function plain(value) { return value === undefined ? value : JSON.parse(JSON.stringify(value)); }

function tmdbClient(fetch) {
    var env = load(['settings-store.js', 'tmdb-store.js', 'tmdb-language.js', 'tmdb.js', 'name-groups.js', 'collection-index.js'], {}, {
        AbortController: AbortController,
        Log: { error: function () {} },
        fetch: fetch,
    });
    env.globals.Prefs.set('tmdbApiKey', 'test-key');
    return env.globals;
}

function reply(status, body) {
    return Promise.resolve({ ok: status === 200, status: status, json: function () { return Promise.resolve(body); } });
}

test('#58 name groups: sequel marks, parts and subtitles join a collection; a common word does not', function () {
    var api = tmdbClient(function () { throw new Error('no request'); });
    var groups = api.NameGroups;
    [
        ['Toy Story 2', 'toy story'], ['The Godfather Part II', 'the godfather'], ['EN - Shrek 2 (2004) 1080p', 'shrek'],
        ['Harry Potter: Chamber of Secrets', 'harry potter'], ['Rocky IV', 'rocky'], ['Up', ''], ['1917', ''],
    ].forEach(function (pair) { assert.equal(groups.base(pair[0]), pair[1], pair[0]); });
    var films = ['Toy Story 3', 'Toy Story', 'Toy Story 2', 'Toy Story 2 4K', 'The Godfather Part II', 'The Godfather', 'Heat']
        .map(function (name, i) { return { name: name, stream_id: i }; });
    var found = groups.groups(films);
    assert.deepEqual(plain(found.map(function (group) { return group.name; })), ['The Godfather', 'Toy Story']);
    // The 4K copy counts once; films are in series order.
    assert.deepEqual(plain(found[1].items.map(function (item) { return item.name; })), ['Toy Story', 'Toy Story 2', 'Toy Story 3']);
    assert.equal(groups.of({ name: 'Toy Story 3' }, films), found[1]);
    assert.equal(groups.of({ name: 'Heat' }, films), null);
    // Thirteen "Movie n" are a word, not a collection.
    var generic = [];
    for (var i = 1; i <= 13; i++) generic.push({ name: 'Movie ' + i, stream_id: 100 + i });
    assert.deepEqual(plain(groups.groups(generic)), []);
});

test('#58 TMDB look-up tells a film with no collection from a failed request and waits after a 429', async function () {
    var calls = [];
    var answers = {
        '/search/movie': function (url) { return /query=Lost/.test(url) ? reply(200, { results: [] }) : reply(200, { results: [{ id: 7, title: 'Alien', release_date: '1979-05-25' }] }); },
        '/movie/7': function () { return reply(200, { id: 7, title: 'Alien', belongs_to_collection: { id: 8091, name: 'Alien Collection' } }); },
        '/movie/9': function () { return reply(404, {}); },
        '/movie/10': function () { return reply(500, {}); },
        '/movie/11': function () { return reply(429, {}); },
    };
    var api = tmdbClient(function (url) {
        var path = /\/3(\/[^?]*)/.exec(url)[1];
        calls.push(path);
        return answers[path](url);
    });
    var found = await api.Tmdb.lookup({ name: 'Alien (1979)' }, 'movie');
    assert.equal(found.status, 'found');
    assert.equal(found.body.belongs_to_collection.id, 8091);
    assert.equal((await api.Tmdb.lookup({ name: 'Lost Film' }, 'movie')).status, 'none');
    assert.equal((await api.Tmdb.lookup({ name: 'Gone', tmdb_id: 9 }, 'movie')).status, 'none');
    assert.equal((await api.Tmdb.lookup({ name: 'Broken', tmdb_id: 10 }, 'movie')).status, 'failed');
    assert.equal(api.Tmdb.throttled(), 0);
    assert.equal((await api.Tmdb.lookup({ name: 'Busy', tmdb_id: 11 }, 'movie')).status, 'failed');
    assert.ok(api.Tmdb.throttled() > 0);
    // A 429 is not kept: asking again goes to TMDB again; a found film does not.
    var before = calls.length;
    await api.Tmdb.lookup({ name: 'Busy', tmdb_id: 11 }, 'movie');
    await api.Tmdb.lookup({ name: 'Alien (1979)' }, 'movie');
    assert.deepEqual(plain(calls.slice(before)), ['/movie/11']);
    assert.equal(api.Tmdb.fetches(), calls.length);
});

test('#58 the collection index keeps films for good and lists collections with two of the provider\'s films', async function () {
    var api = tmdbClient(function () { throw new Error('no request'); });
    var index = api.CollectionIndex('s1');
    await index.ready();
    var films = [1, 2, 3, 4].map(function (n) { return { name: 'Film ' + n, stream_id: n }; });
    index.setFilm(films[0], 50, 501);
    index.setFilm(films[1], 50, 502);
    index.setFilm(films[2], 60, 601);
    index.setFilm(films[3], 0, 0);
    index.setCollection(50, { name: 'Pair', parts: [{ id: 501 }, { id: 502 }], fetched: Date.now(), language: 'en-US' });
    index.setCollection(60, { name: 'Single', parts: [{ id: 601 }, { id: 602 }], fetched: 0, language: 'en-US' });
    var shelf = index.shelf(films);
    assert.deepEqual(plain(shelf.map(function (entry) { return entry.info.name; })), ['Pair']);
    assert.equal(shelf, index.shelf(films), 'worked out once per list');
    assert.equal(index.film(films[3]), 0);
    // An old or other-language collection is fetched again; none for a film in none.
    assert.deepEqual(plain(index.stale('en-US', 30 * 86400000)), [60]);
    assert.deepEqual(plain(index.stale('ar-SA', 30 * 86400000).sort()), [50, 60]);
    await index.save();
    var again = api.CollectionIndex('s1');
    await again.ready();
    assert.deepEqual(plain(again.film(films[0])), [50, 501]);
    assert.equal(api.CollectionIndex('s2').film(films[0]), undefined);
});

function lookupClient(answers) {
    var asked = [];
    var collections = [];
    var forced = [];
    var env = load(['settings-store.js', 'tmdb-store.js', 'tmdb-language.js', 'collection-index.js', 'collection-lookup.js'], {}, {
        Tmdb: {
            enabled: function () { return true; },
            throttled: function () { return 0; },
            fetches: function () { return 0; },
            lookup: function (item, type, force) { asked.push(item.name); forced.push(item.name + (force ? '!' : '')); return Promise.resolve(answers[item.name]); },
            collection: function (id, force) {
                collections.push(id);
                forced.push('c' + id + (force ? '!' : ''));
                return Promise.resolve({ status: 'found', body: { name: 'C' + id, parts: [{ id: 1, title: 'A', release_date: '2001-01-01' }, { id: 2, title: 'B', release_date: '2000-01-01' }] } });
            },
        },
        Player: { isOpen: function () { return false; } },
    });
    return { env: env, asked: asked, collections: collections, forced: forced };
}

function until(check) {
    return new Promise(function (resolve, reject) {
        var started = Date.now();
        (function poll() {
            if (check()) return resolve();
            if (Date.now() - started > 5000) return reject(new Error('timed out ' + check.toString().slice(0, 120)));
            setTimeout(poll, 20);
        })();
    });
}

test('#58 the look-up asks each film once, one at a time, fetches a shared collection once and holds back after a key', async function () {
    var answers = {
        A: { status: 'found', body: { id: 11, belongs_to_collection: { id: 5 } } },
        B: { status: 'found', body: { id: 12, belongs_to_collection: { id: 5 } } },
        C: { status: 'none' },
        D: { status: 'failed' },
    };
    var client = lookupClient(answers);
    var g = client.env.globals;
    var films = ['A', 'B', 'C', 'D'].map(function (name, i) { return { name: name, stream_id: i + 1 }; });
    var index = g.CollectionIndex('s1');
    var changes = 0;
    var deps = { index: index, movies: function () { return films; }, changed: function () { changes++; } };
    g.CollectionLookup.start(deps);
    await until(function () { return client.asked.length === 4; });
    await new Promise(function (resolve) { setTimeout(resolve, 200); });
    assert.deepEqual(plain(client.asked), ['A', 'B', 'C', 'D']);
    assert.deepEqual(plain(client.collections), [5]);
    assert.deepEqual(plain(index.film(films[0])), [5, 11]);
    assert.equal(index.film(films[2]), 0);
    // A failed film is not kept, so it is asked again later, not now.
    assert.equal(index.film(films[3]), undefined);
    assert.deepEqual(plain(index.collection(5).parts.map(function (part) { return part.title; })), ['B', 'A']);
    assert.ok(changes >= 3);
    assert.deepEqual(plain(g.CollectionLookup.progress()), { done: 3, total: 4 });
    // Starting again for the same index changes nothing while it runs.
    g.CollectionLookup.start(deps);
    await new Promise(function (resolve) { setTimeout(resolve, 200); });
    assert.equal(client.asked.length, 4);
    g.CollectionLookup.stop();

    // A key press holds a new run back.
    var other = lookupClient({ E: { status: 'none' } });
    other.env.events.keydown();
    other.env.globals.CollectionLookup.start({ index: other.env.globals.CollectionIndex('s9'), movies: function () { return [{ name: 'E', stream_id: 9 }]; }, changed: function () {} });
    await new Promise(function (resolve) { setTimeout(resolve, 1000); });
    assert.equal(other.asked.length, 0);
    other.env.globals.CollectionLookup.stop();
});

test('#67 Refresh asks every film and collection again with fresh details, keeping what is known until answered', async function () {
    var answers = {
        A: { status: 'found', body: { id: 11, belongs_to_collection: { id: 5 } } },
        B: { status: 'found', body: { id: 12, belongs_to_collection: { id: 5 } } },
        C: { status: 'none' },
    };
    var client = lookupClient(answers);
    var g = client.env.globals;
    var films = ['A', 'B', 'C'].map(function (name, i) { return { name: name, stream_id: i + 1 }; });
    var index = g.CollectionIndex('s1');
    var deps = { index: index, movies: function () { return films; }, changed: function () {} };
    g.CollectionLookup.start(deps);
    await until(function () { return client.asked.length === 3 && g.CollectionLookup.progress() === null; });
    assert.deepEqual(plain(client.forced), ['A', 'c5', 'B', 'C']);

    // C now belongs to collection 5 as well.
    answers.C = { status: 'found', body: { id: 13, belongs_to_collection: { id: 5 } } };
    g.CollectionLookup.refresh(deps);
    await index.ready();
    assert.equal(index.due(films[0]), true);
    // Marked, not forgotten: the shelf still shows collection 5.
    assert.deepEqual(plain(index.film(films[0])), [5, 11]);
    assert.equal(index.shelf(films).length, 1);
    await until(function () { return client.asked.length === 6 && g.CollectionLookup.progress() === null; });
    // Every film once more with its details asked again, the collection once more.
    assert.deepEqual(plain(client.forced.slice(4)), ['A!', 'c5!', 'B!', 'C!']);
    assert.deepEqual(plain(index.film(films[2])), [5, 13]);
    assert.equal(index.due(films[0]), false);
    // A second pass after the refresh asks nothing.
    g.CollectionLookup.start(deps);
    await new Promise(function (resolve) { setTimeout(resolve, 200); });
    assert.equal(client.asked.length, 6);
    g.CollectionLookup.stop();
});

test('#67 a forced look-up asks TMDB for the details again; the search and an unforced look-up stay saved', async function () {
    var calls = [];
    var api = tmdbClient(function (url) {
        var path = /\/3(\/[^?]*)/.exec(url)[1];
        calls.push(path);
        if (path === '/search/movie') return reply(200, { results: [{ id: 7, title: 'Alien', release_date: '1979-05-25' }] });
        if (path === '/collection/8091') return reply(200, { id: 8091, name: 'Alien Collection', parts: [] });
        return reply(200, { id: 7, title: 'Alien', overview: 'Space.', belongs_to_collection: { id: 8091 } });
    });
    await api.Tmdb.lookup({ name: 'Alien (1979)' }, 'movie');
    await api.Tmdb.collection(8091);
    await api.Tmdb.lookup({ name: 'Alien (1979)' }, 'movie');
    await api.Tmdb.collection(8091);
    assert.deepEqual(plain(calls), ['/search/movie', '/movie/7', '/collection/8091']);
    await api.Tmdb.lookup({ name: 'Alien (1979)' }, 'movie', true);
    await api.Tmdb.collection(8091, true);
    assert.deepEqual(plain(calls.slice(3)), ['/movie/7', '/collection/8091']);
});

test('#58 pacing counts every request of a film: its search and details as well as its collection', async function () {
    var spent = 0;
    var times = [];
    var env = load(['settings-store.js', 'tmdb-store.js', 'tmdb-language.js', 'collection-index.js', 'collection-lookup.js'], {}, {
        Tmdb: {
            enabled: function () { return true; },
            throttled: function () { return 0; },
            fetches: function () { return spent; },
            // A film not seen before costs a search and its details.
            lookup: function (item) { times.push([item.name, Date.now()]); spent += 2; return Promise.resolve({ status: 'found', body: { id: item.stream_id, belongs_to_collection: { id: 70 + item.stream_id } } }); },
            collection: function (id) { times.push(['c' + id, Date.now()]); spent += 1; return Promise.resolve({ status: 'found', body: { name: 'C' + id, parts: [] } }); },
        },
        Player: { isOpen: function () { return false; } },
    });
    var g = env.globals;
    var films = [{ name: 'A', stream_id: 1 }, { name: 'B', stream_id: 2 }];
    g.CollectionLookup.start({ index: g.CollectionIndex('s1'), movies: function () { return films; }, changed: function () {} });
    await until(function () { return times.length >= 3; });
    g.CollectionLookup.stop();
    assert.deepEqual(plain(times.slice(0, 3).map(function (entry) { return entry[0]; })), ['A', 'c71', 'B']);
    // Three requests for film A: at two a second, B waits about 1.5 s after A started.
    assert.ok(times[2][1] - times[0][1] >= 1400, 'B asked ' + (times[2][1] - times[0][1]) + ' ms after A');
});

test('#58 a look-up started for one source stops when another source opens; its films never go to the first index', async function () {
    var asked = [];
    var open = 's1';
    var films = { s1: [{ name: 'A', stream_id: 1 }, { name: 'A2', stream_id: 2 }], s2: [{ name: 'B', stream_id: 1 }, { name: 'B2', stream_id: 2 }] };
    var env = load(['settings-store.js', 'tmdb-store.js', 'tmdb-language.js', 'collection-index.js', 'collection-lookup.js', 'collections.js'], {}, {
        Tmdb: {
            enabled: function () { return true; },
            throttled: function () { return 0; },
            fetches: function () { return 0; },
            lookup: function (item) { asked.push(item.name); return Promise.resolve({ status: 'found', body: { id: 500 + item.stream_id } }); },
            collection: function () { return Promise.resolve({ status: 'none' }); },
        },
        Player: { isOpen: function () { return false; } },
    });
    var g = env.globals;
    var collections = g.Collections({
        sourceId: function () { return open; },
        movies: function () { return films[open]; },
        all: function () { return films[open]; },
        changed: function () {},
    });
    collections.start();
    await until(function () { return asked.length >= 1; });
    // Source 2 opens; nothing on the Collections side has run since.
    open = 's2';
    await new Promise(function (resolve) { setTimeout(resolve, 400); });
    g.CollectionLookup.stop();
    assert.equal(asked.indexOf('B'), -1, 'asked ' + asked.join(','));
    assert.equal(asked.indexOf('B2'), -1, 'asked ' + asked.join(','));
    var first = g.CollectionIndex('s1');
    await first.ready();
    assert.deepEqual(plain(first.film({ name: 'B2', stream_id: 2 })), undefined);
});
