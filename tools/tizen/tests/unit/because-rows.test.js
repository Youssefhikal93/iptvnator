'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

var movie = function (n) { return { name: 'Movie ' + n, stream_id: 2000 + n }; };
var show = function (n) { return { name: 'Show ' + n, series_id: 3000 + n }; };
var keepAll = function () { return true; };
// Arrays made inside the sandbox compare by value only through JSON.
var plain = function (value) { return JSON.parse(JSON.stringify(value)); };

// Movie 25 watched 400 s and Movie 24 for 20 s; Show 4's episode 9 watched 600 s.
function scene(extra) {
    var stored = {
        'iptvnator-tv:recent:s1': JSON.stringify({
            movies: [movie(24), movie(25)],
            series: [Object.assign(show(4), { show: show(4), episode: { id: 9 } })],
        }),
        'iptvnator-tv:progress:s1': JSON.stringify(Object.assign({
            'movie:2024': { position: 20, duration: 4000, updatedAt: 2 },
            'movie:2025': { position: 400, duration: 4000, updatedAt: 1 },
            'episode:9': { position: 600, duration: 2400, updatedAt: 1 },
        }, extra)),
    };
    var env = load(['settings-store.js', 'progress.js', 'library.js', 'tmdb-language.js', 'tmdb-store.js', 'tmdb.js', 'because-rows.js'], stored, {}).globals;
    env.Prefs.set('tmdbApiKey', 'test-key');
    return env;
}

function movies(from, to) {
    var list = [];
    for (var n = from; n <= to; n++) list.push(movie(n));
    return list;
}

test('#63 the row follows the latest title watched for five minutes, not one left after seconds', function () {
    var env = scene();
    assert.deepEqual(plain(env.BecauseRows.wanted('s1').map(function (t) { return t.section + ' ' + t.item.name; })), ['movies Movie 25', 'series Show 4']);
    env.BecauseRows.save('s1', 'movies', movie(25), movies(1, 6));
    var rows = env.BecauseRows.rows('s1', keepAll);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].section, 'movies');
    assert.equal(rows[0].title.name, 'Movie 25');
    assert.deepEqual(plain(rows[0].items.map(function (item) { return item.name; })), ['Movie 1', 'Movie 2', 'Movie 3', 'Movie 4', 'Movie 5', 'Movie 6']);
    // A saved list is fresh for a week: nothing more to fetch for the movie.
    assert.deepEqual(plain(env.BecauseRows.wanted('s1').map(function (t) { return t.section; })), ['series']);
});

test('#63 at most 12 titles, without the title itself or kept-out ones; under 4 shows no row', function () {
    var env = scene();
    env.BecauseRows.save('s1', 'movies', movie(25), [movie(25)].concat(movies(1, 20)));
    var rows = env.BecauseRows.rows('s1', function (section, item) { return item.stream_id !== 2001; });
    assert.equal(rows[0].items.length, 12);
    assert.equal(rows[0].items[0].name, 'Movie 2');
    assert.ok(rows[0].items.every(function (item) { return item.stream_id !== 2025; }));
    env.BecauseRows.invalidate();
    env.BecauseRows.save('s1', 'series', show(4), [show(1), show(2), show(3)]);
    assert.deepEqual(plain(env.BecauseRows.rows('s1', keepAll).map(function (row) { return row.section; })), ['movies']);
    env.BecauseRows.save('s1', 'series', show(4), [show(1), show(2), show(3), show(5)]);
    assert.deepEqual(plain(env.BecauseRows.rows('s1', keepAll).map(function (row) { return row.section; })), ['movies', 'series']);
});

test('#63 rows are built once until Home is built again', function () {
    var env = scene();
    env.BecauseRows.save('s1', 'movies', movie(25), movies(1, 6));
    var calls = 0;
    var keep = function () { calls++; return true; };
    var first = env.BecauseRows.rows('s1', keep);
    var counted = calls;
    assert.equal(env.BecauseRows.rows('s1', keep), first);
    assert.equal(calls, counted);
    env.BecauseRows.invalidate();
    assert.notEqual(env.BecauseRows.rows('s1', keep), first);
    // Removing the TMDB key takes the rows away at once.
    env.Prefs.set('tmdbApiKey', '');
    assert.equal(env.BecauseRows.rows('s1', keep).length, 0);
});

test('#63 TMDB order wins over catalogue order, and saved lists stay small', function () {
    var env = scene();
    var found = [movie(3), movie(1), movie(2)].map(function (item) { return { item: item, type: 'movie' }; });
    var credits = [{ id: 1, title: 'Movie 2' }, { id: 2, title: 'Movie 3' }, { id: 3, title: 'Movie 1' }];
    assert.deepEqual(plain(env.BecauseRows.ordered(found, credits).map(function (item) { return item.name; })), ['Movie 2', 'Movie 3', 'Movie 1']);
    for (var n = 1; n <= 25; n++) env.BecauseRows.save('s1', 'movies', movie(n), movies(1, 30));
    var data = JSON.parse(env.localStorage.getItem('iptvnator-tv:because:s1'));
    assert.equal(Object.keys(data).length, 20);
    assert.equal(data['movies:2025'].items.length, 20);
    assert.ok(!data['movies:2001']);
});
