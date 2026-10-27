'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

function app() {
    return load(['genres.js', 'find.js']).globals;
}

function names(list) {
    // Arrays made inside the sandbox are copied so deepEqual compares plain arrays.
    return Array.from(list, function (item) { return item.name; });
}

var LIST = [
    { name: 'The Matrix' },
    { name: 'Matrix Reloaded' },
    { name: 'Dark Drama Night', genre: 'Thriller' },
    { name: 'Kitchen', genre: 'Drama' },
    { name: 'Neo Matrix' },
    { name: 'Unrelated' },
];

test('rank puts titles that start with the query first, then those containing it, then genre matches', function () {
    var g = app();
    assert.deepEqual(names(g.Find.rank(LIST, 'movies', 'matrix')), ['Matrix Reloaded', 'The Matrix', 'Neo Matrix']);
    assert.deepEqual(names(g.Find.rank(LIST, 'movies', 'drama')), ['Dark Drama Night', 'Kitchen']);
});

test('rank keeps list order inside each group and ignores case and spaces around the query', function () {
    var g = app();
    assert.deepEqual(names(g.Find.rank(LIST, 'movies', '  MATRIX ')), ['Matrix Reloaded', 'The Matrix', 'Neo Matrix']);
});

test('rank caps the result only when given a maximum', function () {
    var g = app();
    assert.equal(g.Find.rank(LIST, 'movies', 'matrix').length, 3);
    assert.equal(g.Find.rank(LIST, 'movies', 'matrix', 2).length, 2);
    assert.deepEqual(names(g.Find.rank(LIST, 'movies', 'matrix', 2)), ['Matrix Reloaded', 'The Matrix']);
});

test('rank treats a missing name as empty, so it never matches the text null or undefined', function () {
    var g = app();
    var list = [{ name: null }, {}, { name: 'Nullsville' }];
    assert.deepEqual(names(g.Find.rank(list, 'movies', 'null')), ['Nullsville']);
    assert.deepEqual(names(g.Find.rank(list, 'movies', 'undefined')), []);
});

test('rank does not match channels by genre', function () {
    var g = app();
    assert.equal(g.Find.rank([{ name: 'News 24', genre: 'Drama' }], 'live', 'drama').length, 0);
});

test('Find.search builds a row for each section with matches, capped at sixty', function () {
    var g = app();
    var many = [];
    for (var i = 0; i < 80; i++) many.push({ name: 'Match ' + i });
    var lists = { movies: many, series: [{ name: 'Nothing' }], live: [{ name: 'The match' }] };
    var find = g.Find({
        sections: function () { return ['movies', 'series', 'live']; },
        title: function (section) { return section.toUpperCase(); },
        items: function (section) { return Promise.resolve(lists[section]); },
    });
    return find.search('match').then(function (rows) {
        assert.deepEqual(Array.from(rows, function (row) { return row.id; }), ['find-movies', 'find-live']);
        assert.equal(rows[0].entries.length, 60);
        assert.equal(rows[1].live, true);
        assert.equal(rows[1].entries[0].section, 'live');
    });
});
