'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

// Category 1 is hidden, category 2 is locked, 3 is neither; s2 has its own settings.
function app() {
    // An unlocked session would otherwise keep a real relock timer running.
    var clock = { now: function () { return 0; }, setTimeout: function () { return 0; }, clearTimeout: function () {} };
    var run = load(['profile-store.js', 'settings-store.js', 'hidden-categories.js', 'parental-lock.js', 'kids-profile.js', 'visibility.js'], {}, { ParentalLockClock: clock });
    var g = run.globals;
    g.ParentalLock.setPin('1234');
    g.HiddenCategories.hide('s1', 'movies', '1');
    g.ParentalLock.lock('s1', 'movies', '2');
    g.ParentalLock.lock('s2', 'movies', '3');
    var current = 's1';
    return {
        g: g,
        visibility: g.Visibility(function () { return current; }),
        use: function (id) { current = id; },
    };
}

var LIST = [
    { name: 'hidden', category_id: '1' },
    { name: 'locked', category_id: '2' },
    { name: 'open', category_id: '3' },
];

function names(list) {
    return list.map(function (item) { return item.name; }).join(',');
}

test('items leave out hidden and locked categories', function () {
    assert.equal(names(app().visibility.items('movies', LIST)), 'open');
});

test('withHidden keeps hidden categories, only the lock applies', function () {
    assert.equal(names(app().visibility.items('movies', LIST, { withHidden: true })), 'hidden,open');
});

test('the lock lifts for the session, hidden categories stay hidden', function () {
    var run = app();
    run.g.ParentalLock.unlock('1234');
    assert.equal(names(run.visibility.items('movies', LIST)), 'locked,open');
});

test('items follow the source on screen and never change the input', function () {
    var run = app();
    run.use('s2');
    assert.equal(names(run.visibility.items('movies', LIST)), 'hidden,locked');
    assert.equal(LIST.length, 3);
});

test('allows answers for one item, by default for hidden and locked alike', function () {
    var visibility = app().visibility;
    assert.equal(visibility.allows('movies', LIST[0]), false);
    assert.equal(visibility.allows('movies', LIST[1]), false);
    assert.equal(visibility.allows('movies', LIST[2]), true);
    assert.equal(visibility.allows('movies', LIST[0], { withHidden: true }), true);
    assert.equal(visibility.allows('movies', LIST[1], { withHidden: true }), false);
});

test('allows asks the source of the item when given one, else the source on screen', function () {
    var visibility = app().visibility;
    var third = LIST[2];
    assert.equal(visibility.allows('movies', third), true);
    assert.equal(visibility.allows('movies', third, { sourceId: 's2' }), false);
    assert.equal(visibility.allows('movies', third, { sourceId: undefined }), true);
    // A library item from s2 is judged by the hidden categories of s2.
    assert.equal(visibility.allows('movies', LIST[0], { sourceId: 's2' }), true);
});

test('categories drop hidden rows but keep virtual rows and All', function () {
    var rows = [{ category_id: '', category_name: 'All' }, { category_id: '__fav', virtual: 'favorites' }, { category_id: '1' }, { category_id: '3' }];
    var shown = app().visibility.categories('movies', rows);
    assert.deepEqual(shown.map(function (row) { return row.category_id; }), ['', '__fav', '3']);
});
