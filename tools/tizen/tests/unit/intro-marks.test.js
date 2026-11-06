'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

var KEY = 'iptvnator-tv:p:default:intros';

function marks(stored) {
    return load(['intro-marks.js'], stored || {}, {
        ProfileStore: { key: function (name) { return 'iptvnator-tv:p:default:' + name; } },
    });
}

var plain = function (value) { return JSON.parse(JSON.stringify(value)); };

test('an intro is kept per season, learnt from a skip', function () {
    var api = marks().globals.IntroMarks;
    assert.equal(api.get('s1|7', 1), null);
    api.learn('s1|7', 1, 15000, 45000);
    assert.deepEqual(plain(api.get('s1|7', 1)), { from: 15000, to: 45000, kind: 'learnt' });
    assert.equal(api.get('s1|8', 1), null);
    // An end before its start, or no show, is not saved.
    api.learn('s1|8', 1, 50000, 40000);
    api.learn('', 1, 1000, 30000);
    assert.equal(api.get('s1|8', 1), null);
});

test('a season set by hand keeps its times when skips come, until it is reset', function () {
    var api = marks().globals.IntroMarks;
    api.setByHand('s1|7', 2, 90000, 140000);
    api.learn('s1|7', 2, 10000, 30000);
    assert.deepEqual(plain(api.get('s1|7', 2)), { from: 90000, to: 140000, kind: 'hand' });
    api.reset('s1|7', 2);
    assert.equal(api.get('s1|7', 2), null);
    api.learn('s1|7', 2, 10000, 30000);
    assert.deepEqual(plain(api.get('s1|7', 2)), { from: 10000, to: 30000, kind: 'learnt' });
});

test('a season without its own intro uses the nearest season, the lower one on a tie', function () {
    var api = marks().globals.IntroMarks;
    api.learn('show', 1, 10000, 30000);
    api.setByHand('show', 5, 20000, 50000);
    assert.deepEqual(plain(api.get('show', 2)), { from: 10000, to: 30000, kind: 'other', season: '1' });
    assert.deepEqual(plain(api.get('show', 3)), { from: 10000, to: 30000, kind: 'other', season: '1' });
    assert.deepEqual(plain(api.get('show', 4)), { from: 20000, to: 50000, kind: 'other', season: '5' });
});

test('an intro saved before seasons (its times, or its end alone) serves every season until reset', function () {
    var api = marks({ [KEY]: JSON.stringify({ a: { from: 15000, to: 45000 }, b: 95000 }) }).globals.IntroMarks;
    assert.deepEqual(plain(api.get('a', 3)), { from: 15000, to: 45000, kind: 'other' });
    assert.deepEqual(plain(api.get('b', 1)), { from: 10000, to: 95000, kind: 'other' });
    // A season of its own wins; reset clears the old one too.
    api.learn('a', 3, 20000, 40000);
    assert.equal(api.get('a', 3).kind, 'learnt');
    assert.equal(api.get('a', 1).season, '3');
    api.reset('b', 1);
    assert.equal(api.get('b', 1), null);
});

test('the button is on unless turned off for the show, and off keeps the times', function () {
    var env = marks();
    var api = env.globals.IntroMarks;
    assert.equal(api.shown('show'), true);
    api.learn('show', 1, 10000, 30000);
    api.setShown('show', false);
    assert.equal(api.shown('show'), false);
    assert.equal(api.shown('other'), true);
    assert.equal(api.get('show', 1).from, 10000);
    api.setShown('show', true);
    assert.equal(api.shown('show'), true);
});
