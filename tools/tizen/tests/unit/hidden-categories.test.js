'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

var KEY = 'iptvnator-tv:hidden-categories:s1';

function category(id, name) {
    return { category_id: id, category_name: name || 'Category ' + id };
}

var LIVE = [category('', 'All channels'), category('1'), category('2'), category(3)];

function app(stored) {
    var start = {};
    if (stored) start[KEY] = JSON.stringify(stored);
    var run = load(['hidden-categories.js'], start);
    return { hidden: run.globals.HiddenCategories, stored: run.stored };
}

function ids(list) {
    return list.map(function (item) { return String(item.category_id); }).join(',');
}

test('hiding is stored per source and section and survives a new session', function () {
    var run = app();
    run.hidden.hide('s1', 'live', '2');
    run.hidden.hide('s1', 'live', 2);
    run.hidden.hide('s1', 'movies', '9');
    assert.deepEqual(JSON.parse(run.stored[KEY]), { live: ['2'], movies: ['9'] });
    assert.equal(run.hidden.isHidden('s1', 'live', 2), true);
    assert.equal(run.hidden.isHidden('s2', 'live', 2), false);
    assert.equal(run.hidden.isHidden('s1', 'series', 2), false);
    var again = app(JSON.parse(run.stored[KEY])).hidden;
    assert.equal(again.count('s1', 'live'), 1);
    assert.equal(again.count('s1', 'movies'), 1);
});

test('visible drops hidden real categories but never virtual rows or All channels', function () {
    var run = app({ live: ['', '1', '__fav'] });
    var rows = [{ category_id: '__fav', virtual: 'favorites' }].concat(LIVE);
    assert.equal(ids(run.hidden.visible('s1', 'live', rows)), '__fav,,2,3');
    assert.equal(rows.length, 5);
    // Nothing hidden: the same list comes back.
    assert.equal(app().hidden.visible('s1', 'live', LIVE), LIVE);
});

test('toggle and show bring a category back; showAll clears the section only', function () {
    var run = app({ live: ['1', '2'], movies: ['5'] });
    assert.equal(run.hidden.toggle('s1', 'live', '3'), true);
    assert.equal(run.hidden.toggle('s1', 'live', '1'), false);
    assert.equal(run.hidden.ids('s1', 'live').join(','), '2,3');
    run.hidden.showAll('s1', 'live');
    assert.deepEqual(JSON.parse(run.stored[KEY]), { movies: ['5'] });
    run.hidden.show('s1', 'movies', '5');
    assert.deepEqual(JSON.parse(run.stored[KEY]), {});
});

test('hide all except keeps one real category and never lists virtual ones', function () {
    var run = app({ live: ['2'] });
    run.hidden.hideAllExcept('s1', 'live', LIVE, '2');
    assert.equal(run.hidden.ids('s1', 'live').join(','), '1,3');
    assert.equal(ids(run.hidden.visible('s1', 'live', LIVE)), ',2');
    assert.equal(run.hidden.isReal({ category_id: '', category_name: 'All channels' }), false);
    assert.equal(run.hidden.isReal({ category_id: '__fav', virtual: 'favorites' }), false);
    assert.equal(run.hidden.isReal(category('0')), true);
});

test('items, saved snapshots, episodes and M3U channels follow their category', function () {
    var run = app({ live: ['2', 'News'], series: ['8'] });
    var list = [
        { name: 'a', category_id: '1' },
        { name: 'b', category_id: '2' },
        { name: 'c', category_id: 2 },
        { name: 'd', group: 'News' },
        { name: 'e', group: 'Sports' },
        { name: 'f' },
    ];
    assert.equal(run.hidden.filterItems('s1', 'live', list).map(function (item) { return item.name; }).join(''), 'aef');
    var episode = { name: 'Show', show: { name: 'Show', category_id: '8' }, episode: { id: 1 } };
    assert.equal(run.hidden.allows('s1', 'series', episode), false);
    assert.equal(run.hidden.allows('s1', 'movies', { category_id: '8' }), true);
    assert.equal(run.hidden.filterItems('s1', 'series', [episode]).length, 0);
    assert.equal(app().hidden.filterItems('s1', 'live', list), list);
});

test('missing or damaged storage means nothing is hidden', function () {
    ['{bad json', 'null', '"text"', '[]'].forEach(function (text) {
        var start = {};
        start[KEY] = text;
        var hidden = load(['hidden-categories.js'], start).globals.HiddenCategories;
        assert.equal(hidden.visible('s1', 'live', LIVE).length, 4);
        assert.equal(hidden.count('s1', 'live'), 0);
    });
    var broken = load(['hidden-categories.js'], {}, { localStorage: { getItem: function () { throw new Error('unavailable'); }, setItem: function () { throw new Error('full'); } } });
    assert.equal(broken.globals.HiddenCategories.count('s1', 'live'), 0);
    broken.globals.HiddenCategories.hide('s1', 'live', '1');
});
