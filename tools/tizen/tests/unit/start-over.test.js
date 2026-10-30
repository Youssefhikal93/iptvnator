'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

test('#82 catch-up seeks stop at now while a programme airs, and at its end afterwards', function () {
    var clock = { at: 0 };
    var catchUp = load(['catch-up.js'], {}, { Date: { now: function () { return clock.at; } } }).globals.CatchUp;
    var programme = { start: 10000, end: 20000 };
    // Before/start/inside/end/after: never seek before zero or into future time.
    [[0, 0], [10000, 0], [15000, 5000], [20000, 10000], [30000, 10000]].forEach(function (entry) {
        clock.at = entry[0];
        assert.equal(catchUp.livePosition(programme), entry[1]);
    });
});
