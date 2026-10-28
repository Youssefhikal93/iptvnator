'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

function marks(stored) {
    return load(['intro-marks.js'], stored || {}, {
        ProfileStore: { key: function (name) { return 'iptvnator-tv:p:default:' + name; } },
    });
}

test('an intro is kept as where it starts and ends, per show', function () {
    var env = marks();
    var api = env.globals.IntroMarks;
    assert.equal(api.get('s1|7'), null);
    api.set('s1|7', 15000, 45000);
    assert.equal(JSON.stringify(api.get('s1|7')), '{"from":15000,"to":45000}');
    assert.equal(api.get('s1|8'), null);
    // An end before its start, or no show, is not saved.
    api.set('s1|8', 50000, 40000);
    api.set('', 1000, 30000);
    assert.equal(api.get('s1|8'), null);
    api.clear('s1|7');
    assert.equal(api.get('s1|7'), null);
});

test('an intro saved by the earlier version (its end alone) still counts, from 0:10', function () {
    var env = marks({ 'iptvnator-tv:p:default:intros': JSON.stringify({ 's1|7': 95000 }) });
    assert.equal(JSON.stringify(env.globals.IntroMarks.get('s1|7')), '{"from":10000,"to":95000}');
});
