'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

// The screen the rule looks at; each test changes only what it needs.
function list(screen) {
    var now = Object.assign({ section: 'movies', base: true, category: null, loading: {} }, screen);
    var current = load(['current-list.js']).globals.CurrentList(function () { return now; });
    current.screen = now;
    return current;
}

var CATEGORIES = { section: 'movies', kind: 'categories' };
var WHOLE = { section: 'movies', kind: 'items' };
var WHOLE_EMPTY_ID = { section: 'movies', kind: 'items', id: '' };
var DRAMA = { section: 'movies', kind: 'items', id: '12' };

var drama = { category_id: '12', category_name: 'Drama' };
var all = { category_id: '', category_name: 'All movies', all: 'movies' };
var favorites = { category_id: '__fav', virtual: 'favorites', fromCatalogue: true };
var added = { category_id: '__added', virtual: 'added', fromCatalogue: true };
var recent = { category_id: '__recent', virtual: 'recent', fromCatalogue: false };
var continued = { category_id: '__continue', virtual: 'continue', fromCatalogue: false };

// [name, screen, what, wanted]
var TABLE = [
    ['Home waits for a whole list it is loading', { section: 'home', loading: { movies: true } }, WHOLE, true],
    ['Home accepts an empty id as the whole list', { section: 'home', loading: { movies: true } }, WHOLE_EMPTY_ID, true],
    ['Home ignores a list that is not loading', { section: 'home', loading: { series: true } }, WHOLE, false],
    ['Home ignores one category of a loading section', { section: 'home', loading: { movies: true } }, DRAMA, false],
    ['Home ignores categories', { section: 'home', loading: { movies: true } }, CATEGORIES, false],
    ['another section is never wanted', { section: 'series', category: drama }, DRAMA, false],
    ['Settings wants nothing', { section: 'settings', category: drama }, WHOLE, false],
    ['categories are wanted until they are loaded', { base: false }, CATEGORIES, true],
    ['categories are not wanted once loaded', { base: true }, CATEGORIES, false],
    ['no category under the cursor wants no items', { category: null }, WHOLE, false],
    ['the category under the cursor is wanted', { category: drama }, DRAMA, true],
    ['its id compares as text', { category: { category_id: 12 } }, DRAMA, true],
    ['another category is not wanted', { category: drama }, { section: 'movies', kind: 'items', id: '13' }, false],
    ['the whole list is not wanted under a category', { category: drama }, WHOLE, false],
    ['All wants the whole list without an id', { category: all }, WHOLE, true],
    ['All wants the whole list with an empty id', { category: all }, WHOLE_EMPTY_ID, true],
    ['Favorites wait for the whole list', { category: favorites }, WHOLE, true],
    ['Recently added waits for the whole list', { category: added }, WHOLE, true],
    ['Favorites do not wait for one category', { category: favorites }, DRAMA, false],
    ['Recently watched waits for nothing', { category: recent }, WHOLE, false],
    ['Continue watching waits for nothing', { category: continued }, WHOLE, false],
    ['categories are not wanted under a category', { category: drama }, CATEGORIES, false],
];

TABLE.forEach(function (row) {
    test('wants: ' + row[0], function () {
        assert.equal(list(row[1]).wants(row[2]), row[3]);
    });
});

test('wants: search results wait for the whole list, whatever the category under the cursor', function () {
    var current = list({ category: drama });
    current.beginSearch();
    assert.equal(current.wants(WHOLE), true);
    assert.equal(current.wants(WHOLE_EMPTY_ID), true);
    assert.equal(current.wants(DRAMA), false);
    assert.equal(current.wants(CATEGORIES), false);
    // A search in another section than the one fetched.
    assert.equal(current.wants({ section: 'series', kind: 'items' }), false);
});

test('wants: leaving the search brings the category back', function () {
    var current = list({ category: drama });
    current.beginSearch();
    current.begin();
    assert.equal(current.wants(WHOLE), false);
    assert.equal(current.wants(DRAMA), true);
});

test('wants reads the screen when asked, not when the list was made', function () {
    var current = list({ base: true });
    assert.equal(current.wants(CATEGORIES), false);
    current.screen.base = false;
    assert.equal(current.wants(CATEGORIES), true);
});

test('only the list that began last is active', function () {
    var current = list();
    var first = current.begin();
    assert.equal(current.isActive(first), true);
    var second = current.begin();
    assert.equal(current.isActive(first), false);
    assert.equal(current.isActive(second), true);
    var search = current.beginSearch();
    assert.equal(current.isActive(second), false);
    assert.equal(current.isActive(search), true);
});

test('a list is not showing search results until a search begins', function () {
    var current = list();
    assert.equal(current.showingSearch(), false);
    current.beginSearch();
    assert.equal(current.showingSearch(), true);
    current.begin();
    assert.equal(current.showingSearch(), false);
});
