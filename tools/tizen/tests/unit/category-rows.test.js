'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

// Plain lists stand in for the library; options change what the browser would say.
function rows(options) {
    var o = Object.assign({ ready: true, section: 'movies', sortable: true, everySource: false, added: [], favorites: [{ name: 'F' }], recent: [], continued: [{ name: 'C' }] }, options);
    var g = load(['category-rows.js']).globals;
    return g.CategoryRows({
        ready: function () { return o.ready; },
        section: function () { return o.section; },
        sortable: function () { return o.sortable; },
        everySource: function () { return o.everySource; },
        chosenSort: function () { return 'rating'; },
        favorites: function () { return o.favorites; },
        favoriteItems: function () { return [{ name: 'F from catalogue' }]; },
        recent: function () { return o.recent; },
        continued: function () { return o.continued; },
        added: function () { return o.added; },
    });
}

function kinds(list) {
    return Array.from(list, function (row) { return row.virtual || (row.all ? 'all' : 'category'); }).join(',');
}

function find(list, kind) {
    return Array.from(list).filter(function (row) { return row.virtual === kind; })[0];
}

test('nothing is built before a source is open', function () {
    assert.equal(rows({ ready: false }).build().length, 0);
});

test('Movies and Series start with All, then Recently added when dated, then the library rows', function () {
    assert.equal(kinds(rows({ added: [{ name: 'New' }] }).build()), 'all,added,favorites,recent,continue');
    assert.equal(kinds(rows({ section: 'series', added: [{ name: 'New' }] }).build()), 'all,added,favorites,recent,continue');
});

test('Recently added is left out when the section is not sortable or has no dated items', function () {
    assert.equal(kinds(rows({ added: [] }).build()), 'all,favorites,recent,continue');
    assert.equal(kinds(rows({ sortable: false, added: [{ name: 'New' }] }).build()), 'all,favorites,recent,continue');
});

test('Live TV has no All row and no Continue watching', function () {
    assert.equal(kinds(rows({ section: 'live' }).build()), 'favorites,recent');
});

test('each library row carries its count, its list and its empty text', function () {
    var list = rows({ added: [{ name: 'N1' }, { name: 'N2' }], recent: [{ name: 'R' }] }).build();
    var added = find(list, 'added');
    var recent = find(list, 'recent');
    assert.equal(added.count, 2);
    assert.equal(added.list().length, 2);
    assert.equal(added.empty[0], 'Nothing recently added');
    assert.equal(recent.count, 1);
    assert.equal(find(list, 'continue').list()[0].name, 'C');
    assert.equal(find(list, 'favorites').empty[0], 'No favorites yet');
    assert.equal(find(list, 'continue').empty[0], 'Nothing to continue');
});

test('Favorites show the catalogue refreshed favorites in a sortable section, the plain ones elsewhere', function () {
    assert.equal(find(rows().build(), 'favorites').list()[0].name, 'F from catalogue');
    assert.equal(find(rows({ sortable: false }).build(), 'favorites').list()[0].name, 'F');
    // The count is always of the saved favorites.
    assert.equal(find(rows().build(), 'favorites').count, 1);
});

test('Favorites of every source are the merged library, never refreshed from one catalogue', function () {
    assert.equal(find(rows({ everySource: true }).build(), 'favorites').list()[0].name, 'F');
});

test('which rows are shown again when the whole section list arrives', function () {
    var list = rows({ added: [{ name: 'New' }] }).build();
    assert.equal(find(list, 'added').fromCatalogue, true);
    assert.equal(find(list, 'favorites').fromCatalogue, true);
    assert.equal(find(list, 'recent').fromCatalogue, false);
    assert.equal(find(list, 'continue').fromCatalogue, false);
});

test('sortMode and canSort for every kind of row in a sortable section', function () {
    var run = rows({ added: [{ name: 'New' }] });
    var list = run.build();
    var category = { category_id: '12', category_name: 'Drama' };
    // [row, order, can the viewer choose it]
    [
        [null, 'rating', true],
        [list[0], 'rating', true],
        [category, 'rating', true],
        [find(list, 'favorites'), 'rating', true],
        [find(list, 'added'), 'newest', false],
        [find(list, 'recent'), null, false],
        [find(list, 'continue'), null, false],
    ].forEach(function (row) {
        assert.equal(run.sortMode(row[0]), row[1], 'order of ' + (row[0] && (row[0].virtual || row[0].category_id)));
        assert.equal(run.canSort(row[0]), row[2], 'choice of ' + (row[0] && (row[0].virtual || row[0].category_id)));
    });
});

test('Favorites of every source cannot be sorted', function () {
    var run = rows({ everySource: true });
    var favorites = find(run.build(), 'favorites');
    assert.equal(run.sortMode(favorites), null);
    assert.equal(run.canSort(favorites), false);
});

test('a section that cannot be sorted has no order and no Sort choice, whatever the row', function () {
    var run = rows({ sortable: false, section: 'live' });
    var list = run.build();
    assert.equal(run.sortMode(null), null);
    assert.equal(run.canSort(null), false);
    assert.equal(run.sortMode(find(list, 'favorites')), null);
    assert.equal(run.canSort(find(list, 'favorites')), false);
    assert.equal(run.sortMode({ category_id: '3' }), null);
});

test('a row follows the settings of the moment it is asked, not of when it was built', function () {
    var state = { every: false };
    var g = load(['category-rows.js']).globals;
    var run = g.CategoryRows({
        ready: function () { return true; },
        section: function () { return 'movies'; },
        sortable: function () { return true; },
        everySource: function () { return state.every; },
        chosenSort: function () { return 'rating'; },
        favorites: function () { return []; },
        favoriteItems: function () { return []; },
        recent: function () { return []; },
        continued: function () { return []; },
        added: function () { return []; },
    });
    var favorites = find(run.build(), 'favorites');
    assert.equal(run.canSort(favorites), true);
    state.every = true;
    assert.equal(run.canSort(favorites), false);
});
