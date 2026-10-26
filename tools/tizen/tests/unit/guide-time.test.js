'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var time = load(['guide-time.js']).globals.GuideTime;
var HOUR = 3600000;
var NOW = 20 * HOUR + 17 * 60000;

test('time window pages at the edges and clamps to two hours back and twenty-four ahead', function () {
    var start = 20 * HOUR;
    var cases = [
        [start, start, start],
        [start, start + 3 * HOUR - 1, start],
        [start, start + 3 * HOUR, start + 3 * HOUR],
        [start, start - 1, start - HOUR / 2],
        [start, NOW - 10 * HOUR, NOW - 2 * HOUR],
        [start, NOW + 30 * HOUR, NOW + 21 * HOUR],
    ];
    cases.forEach(function (entry) { assert.equal(time.windowStart(entry[0], entry[1], NOW), entry[2]); });
    assert.equal(time.clamp(NOW - 10 * HOUR, NOW), NOW - 2 * HOUR);
    assert.equal(time.clamp(NOW + 30 * HOUR, NOW), NOW + 24 * HOUR - 1);
    assert.equal(time.clamp(NOW, NOW), NOW);
});

test('programme focus uses half-open intervals and crosses gaps in either direction', function () {
    var list = [{ start: 0, end: 10 }, { start: 10, end: 20 }, { start: 30, end: 40 }];
    assert.equal(time.at(list, 10), list[1]);
    assert.equal(time.at(list, 20), null);
    assert.equal(time.adjacent(list, 5, 1), list[1]);
    assert.equal(time.adjacent(list, 15, -1), list[0]);
    assert.equal(time.adjacent(list, 25, 1), list[2]);
    assert.equal(time.adjacent(list, 25, -1), list[1]);
    assert.equal(time.adjacent(list, 35, 1), null);
    assert.equal(time.at([], 5), null);
    assert.equal(time.adjacent([], 5, -1), null);
});

test('row paging keeps a screen around focus without running beyond empty, short or final lists', function () {
    [[0, 0, 0], [2, 3, 0], [8, 500, 0], [9, 500, 9], [499, 500, 491]].forEach(function (entry) {
        assert.equal(time.firstRow(entry[0], entry[1], 9), entry[2]);
    });
});
