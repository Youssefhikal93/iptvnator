'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

function client(overrides) {
    return load(['settings-store.js', 'tmdb-store.js', 'tmdb-language.js', 'tmdb.js'], {}, Object.assign({
        AbortController: AbortController,
        Log: { error: function () {} },
    }, overrides)).globals;
}

test('TMDB matching normalizes source tags and accents, preserves title words, and rejects remakes', function () {
    var api = client().Tmdb;
    [
        ['EN - Amélie (2001) 1080p', 'amelie'],
        ['The Matrix [1999] 4K', 'the matrix'],
        ['It Follows', 'it follows'],
        ['Us', 'us'],
        ['Spider-Man: Homecoming', 'spider man homecoming'],
        ['1917', '1917'],
        ['2001: A Space Odyssey (1968)', '2001 a space odyssey'],
    ].forEach(function (pair) { assert.equal(api.normalize(pair[0]), pair[1]); });
    var remakes = [{ id: 1, title: 'Dune', release_date: '1984-01-01' }, { id: 2, title: 'Dune', release_date: '2021-01-01' }];
    assert.equal(api.pick({ name: 'Dune (2021)' }, remakes).id, 2);
    assert.equal(api.pick({ name: 'Dune (2020)' }, remakes), null);
    assert.equal(api.pick({ name: 'Dune' }, remakes), null);
    assert.equal(api.pick({ name: 'Other title', tmdb_id: '1' }, remakes).id, 1);
    assert.equal(api.year({ name: 'Film (2001)', year: '2022-08-03' }), '2022');
    assert.equal(api.year({ name: '1917' }), '');
    assert.equal(api.year({ name: '2001: A Space Odyssey' }), '');
    assert.equal(api.year({ name: '2001: A Space Odyssey (1968) 1080p' }), '1968');
});

test('TMDB library intersection respects media type, ids and years', function () {
    var api = client().Tmdb;
    var catalogue = [
        { type: 'movie', item: { name: 'Dune (1984)' } },
        { type: 'movie', item: { name: 'Dune (2021)' } },
        { type: 'tv', item: { name: 'Dune (2021)' } },
        { type: 'movie', item: { name: 'A source spelling', tmdb_id: 9 } },
        { type: 'movie', item: { name: 'Constructor (2020)' } },
    ];
    var found = api.inLibrary([{ id: 2, title: 'Dune', release_date: '2021-01-01', media_type: 'movie' }, { id: 9, title: 'Different', media_type: 'movie' }, { id: 10, title: 'Constructor', release_date: '2020-01-01', media_type: 'movie' }], catalogue);
    assert.equal(found.length, 3);
    assert.equal(found[0].item.name, 'Dune (2021)');
    assert.equal(found[1].item.tmdb_id, 9);
    assert.equal(found[2].item.name, 'Constructor (2020)');
});

test('reading an old cached match does not extend its seven-day lifetime', async function () {
    var now = 100000;
    var calls = 0;
    var api = client({
        Date: { now: function () { return now; } },
        fetch: function () {
            calls++;
            return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ id: 1 }); } });
        },
    });
    api.Prefs.set('tmdbApiKey', 'key');
    var movie = { tmdb_id: 1 };
    await api.Tmdb.match(movie, 'movie');
    now += 6 * 86400000;
    await api.Tmdb.match(movie, 'movie');
    assert.equal(calls, 1);
    now += 86400000;
    assert.equal(api.Tmdb.cached(movie, 'movie'), null);
    await api.Tmdb.match(movie, 'movie');
    assert.equal(calls, 2);
});

test('TMDB cache expires successes after seven days and failures after one hour, including the boundary', async function () {
    var now = 100000;
    var api = client({ Date: { now: function () { return now; } } });
    await api.TmdbStore.put('/ok', { id: 1 }, false);
    await api.TmdbStore.put('/failed', null, true);
    now += 3599999;
    assert.equal((await api.TmdbStore.get('/failed')).failed, true);
    now++;
    assert.equal(await api.TmdbStore.get('/failed'), null);
    assert.equal((await api.TmdbStore.get('/ok')).body.id, 1);
    now = 100000 + 7 * 86400000;
    assert.equal(await api.TmdbStore.get('/ok'), null);
});

test('no key prevents requests and images even when matches were previously cached', async function () {
    var calls = 0;
    var api = client({ fetch: function () {
        calls++;
        return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ id: 1 }); } });
    } });
    assert.equal(await api.Tmdb.request('/configuration'), null);
    assert.equal(await api.Tmdb.match({ name: 'Dune' }, 'movie'), null);
    assert.equal(api.Tmdb.image('/poster.jpg', 'w500'), '');
    assert.equal(calls, 0);
    api.Prefs.set('tmdbApiKey', 'key');
    await api.Tmdb.request('/configuration');
    await api.Tmdb.match({ tmdb_id: 1 }, 'movie');
    api.Prefs.set('tmdbApiKey', '');
    assert.equal(await api.Tmdb.request('/configuration'), null);
    assert.equal(await api.Tmdb.match({ tmdb_id: 1 }, 'movie'), null);
    assert.equal(api.Tmdb.image('/poster.jpg', 'w500'), '');
    assert.equal(calls, 2);
});

test('TMDB shares pending requests, caches failures and never reuses a refused key for another key', async function () {
    var calls = 0;
    var api = client({ fetch: function () {
        calls++;
        return Promise.resolve({ ok: calls > 1, json: function () { return Promise.resolve({ works: true }); } });
    } });
    api.Prefs.set('tmdbApiKey', 'bad');
    var results = await Promise.all([api.Tmdb.request('/configuration'), api.Tmdb.request('/configuration')]);
    assert.equal(results[0], null);
    assert.equal(await api.Tmdb.request('/configuration'), null);
    assert.equal(calls, 1);
    api.Prefs.set('tmdbApiKey', 'good');
    assert.equal((await api.Tmdb.request('/configuration')).works, true);
    assert.equal(calls, 2);
});

test('TMDB limits requests to three and drops queued traffic after key removal', async function () {
    var releases = [];
    var active = 0;
    var peak = 0;
    var calls = 0;
    var api = client({ fetch: function () {
        calls++; active++; peak = Math.max(peak, active);
        return new Promise(function (resolve) { releases.push(function () {
            active--;
            resolve({ ok: true, json: function () { return Promise.resolve({ id: calls }); } });
        }); });
    } });
    api.Prefs.set('tmdbApiKey', 'key');
    var jobs = [1, 2, 3, 4, 5].map(function (id) { return api.Tmdb.request('/movie/' + id); });
    await new Promise(setImmediate);
    assert.equal(calls, 3);
    api.Prefs.set('tmdbApiKey', '');
    releases.forEach(function (release) { release(); });
    var answers = await Promise.all(jobs);
    assert.equal(peak, 3);
    assert.equal(calls, 3);
    assert.equal(answers.filter(Boolean).length, 0);
});
