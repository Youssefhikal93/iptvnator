'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

var SOURCES = [{ id: 's1', type: 'xtream', name: 'One' }, { id: 's2', type: 'm3u', name: 'Two' }];

// A grown-up "Me" with PIN 1234 and a kids profile "Kids" it guards; the kids
// profile may see movies of category 3 on s1 only.
function app(options) {
    var clock = { now: function () { return 0; }, setTimeout: function () { return 0; }, clearTimeout: function () {} };
    var opened = [];
    var run = load(['profile-store.js', 'settings-store.js', 'hidden-categories.js', 'parental-lock.js', 'kids-profile.js', 'visibility.js'], {}, {
        ParentalLockClock: clock,
        Sources: { all: function () { return SOURCES; } },
        PinPad: { open: function (mode, done, guardian) { opened.push({ mode: mode, done: done, guardian: guardian }); } },
    });
    var g = run.globals;
    g.ParentalLock.setPin('1234');
    var kids = g.ProfileStore.add('Kids');
    g.ProfileStore.setKids(kids.id, 'default');
    g.ProfileStore.setActive(kids.id);
    g.KidsProfile.save(kids.id, 's1', { live: ['7'], movies: ['3'], series: [] });
    if (!(options && options.stayKids)) g.ProfileStore.setActive('default');
    return { g: g, kids: kids, stored: run.stored, opened: opened };
}

var MOVIES = [
    { name: 'drama', category_id: '1' },
    { name: 'cartoon', category_id: '3' },
    { name: 'new', category_id: '99' },
    { name: 'no category' },
];

function names(list) {
    return list.map(function (item) { return item.name; }).join(',');
}

test('a grown-up profile sees everything and pays nothing: the same list comes back', function () {
    var g = app().g;
    assert.equal(g.KidsProfile.on(), false);
    assert.equal(g.KidsProfile.filterItems('s1', 'movies', MOVIES), MOVIES);
    assert.equal(g.KidsProfile.allows('s1', 'movies', MOVIES[0]), true);
    assert.equal(g.KidsProfile.any('s1', 'series'), true);
});

test('a kids profile sees only ticked categories; later or unknown ones stay hidden', function () {
    var g = app({ stayKids: true }).g;
    var visibility = g.Visibility(function () { return 's1'; });
    assert.equal(g.KidsProfile.on(), true);
    assert.equal(names(visibility.items('movies', MOVIES)), 'cartoon');
    // withHidden lifts hidden categories, never the kids rule.
    assert.equal(names(visibility.items('movies', MOVIES, { withHidden: true })), 'cartoon');
    assert.equal(visibility.allows('movies', MOVIES[0], { withHidden: true }), false);
    assert.equal(visibility.allows('movies', MOVIES[1]), true);
    var rows = [{ category_id: '', category_name: 'All' }, { category_id: '__fav', virtual: 'favorites' }, { category_id: '1' }, { category_id: '3' }];
    assert.deepEqual(visibility.categories('movies', rows).map(function (row) { return row.category_id; }), ['', '__fav', '3']);
    assert.equal(visibility.items('series', MOVIES).length, 0);
    assert.equal(g.KidsProfile.any('s1', 'series'), false);
    assert.equal(g.KidsProfile.any('s1', 'live'), true);
});

test('lists are per source: another source with nothing ticked shows nothing', function () {
    var g = app({ stayKids: true }).g;
    assert.equal(g.Visibility(function () { return 's2'; }).items('movies', MOVIES).length, 0);
    assert.equal(g.KidsProfile.allows('s2', 'movies', MOVIES[1]), false);
    // A library item from s1 is judged by the lists of s1.
    assert.equal(g.Visibility(function () { return 's2'; }).allows('movies', MOVIES[1], { sourceId: 's1' }), true);
});

test('the lists are read once per source, not per item or per list', function () {
    var run = app({ stayKids: true });
    var reads = 0;
    var getItem = run.g.localStorage.getItem;
    run.g.localStorage.getItem = function (key) {
        if (key.indexOf('kids-allowed') !== -1) reads++;
        return getItem(key);
    };
    run.g.Stored.forget && run.g.Stored.forget(run.g.ProfileStore.keyOf(run.kids.id, 'kids-allowed:s1'));
    for (var i = 0; i < 5; i++) run.g.KidsProfile.filterItems('s1', 'movies', MOVIES);
    MOVIES.forEach(function (item) { run.g.KidsProfile.allows('s1', 'movies', item); });
    assert.ok(reads <= 1, 'read ' + reads + ' times');
});

test('a kids profile opens on a source with ticks; with none anywhere it has no source', function () {
    var run = app({ stayKids: true });
    var g = run.g;
    assert.equal(g.KidsProfile.source(SOURCES[0]).id, 's1');
    assert.equal(g.KidsProfile.source(SOURCES[1]).id, 's1');
    g.KidsProfile.save(run.kids.id, 's1', { live: [], movies: [], series: [] });
    assert.equal(g.KidsProfile.source(SOURCES[0]), null);
    assert.equal(g.KidsProfile.any('s1', 'movies'), false);
    assert.equal(run.stored['iptvnator-tv:p:' + run.kids.id + ':kids-allowed:s1'], undefined);
});

test('leaving a kids profile asks for its guardian\'s PIN; staying does not', function () {
    var run = app({ stayKids: true });
    var left = 0;
    run.g.KidsProfile.leave(run.kids.id, function () { left++; });
    assert.equal(left, 1);
    assert.equal(run.opened.length, 0);
    run.g.KidsProfile.leave('default', function () { left++; });
    assert.equal(left, 1);
    assert.equal(run.opened[0].mode, 'guardian');
    assert.deepEqual(JSON.parse(JSON.stringify(run.opened[0].guardian)), { profileId: 'default', name: 'Me' });
    run.opened[0].done();
    assert.equal(left, 2);
});

test('the guardian\'s PIN is checked against the guardian\'s profile, not the kids one', function () {
    var run = app({ stayKids: true });
    assert.equal(run.g.ParentalLock.hasPin(), false);
    assert.equal(run.g.ParentalLock.verify('1234', 'default'), true);
    assert.equal(run.g.ParentalLock.verify('4321', 'default'), false);
});

test('without a guardian PIN anywhere nothing can guard the profile, so leaving needs none', function () {
    var run = app({ stayKids: true });
    run.g.ProfileStore.setActive('default');
    run.g.ParentalLock.removePin();
    run.g.ProfileStore.setActive(run.kids.id);
    assert.equal(run.g.KidsProfile.guardianOf(run.g.ProfileStore.active()), null);
    var left = 0;
    run.g.KidsProfile.leave('default', function () { left++; });
    assert.equal(left, 1);
});

test('a normal profile again: the switch off keeps its lists but lifts every rule', function () {
    var run = app({ stayKids: true });
    run.g.ProfileStore.setKids(run.kids.id, null);
    run.g.KidsProfile.refresh();
    assert.equal(run.g.KidsProfile.on(), false);
    assert.equal(run.g.KidsProfile.filterItems('s1', 'movies', MOVIES), MOVIES);
    assert.equal(run.g.ProfileStore.active().kids, undefined);
});
