'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

function engine() {
    var now = 0;
    var poll;
    var state = { position: 0, pending: false, timeouts: 0, seeks: 0 };
    var app = load(['player-resume.js'], {}, {
        Date: { now: function () { return now; } },
        setInterval: function (callback) { poll = callback; return 1; },
        clearInterval: function () { poll = null; },
    });
    state.resume = app.globals.PlayerResume({
        position: function () { return state.position; },
        pending: function () { return state.pending; },
        ready: function () { return true; },
        seekTo: function () { state.seeks++; }, // The engine accepts a seek before reporting its position.
        timeout: function () { state.timeouts++; },
    });
    state.advance = function (milliseconds) { now += milliseconds; if (poll) poll(); };
    return state;
}

test('#33 progress stays protected until a later engine update confirms a settled seek', function () {
    var playback = engine();
    playback.resume.start(300000);
    assert.equal(playback.resume.blocked(), true);
    playback.resume.onTime();
    assert.equal(playback.resume.blocked(), true);
    playback.position = 300000;
    playback.pending = true;
    playback.resume.onTime();
    assert.equal(playback.resume.blocked(), true);
    playback.pending = false;
    playback.position = 10000;
    playback.resume.onTime();
    assert.equal(playback.resume.blocked(), true);
    playback.position = 302000;
    playback.resume.onTime();
    assert.equal(playback.resume.blocked(), false);
    assert.equal(playback.timeouts, 0);
});

test('#33 a restoration timeout keeps progress protected until Start over or leaving cancels it', function () {
    var playback = engine();
    playback.resume.start(300000);
    playback.advance(30000);
    assert.equal(playback.timeouts, 1);
    assert.equal(playback.resume.blocked(), true);
    playback.position = 300000;
    playback.resume.onTime();
    assert.equal(playback.resume.blocked(), true);
    playback.resume.cancel();
    assert.equal(playback.resume.blocked(), false);
});

test('a settled seek that reports the target is not sent again', function () {
    var playback = engine();
    playback.resume.start(60000);
    playback.position = 60000;
    playback.advance(800);
    assert.equal(playback.resume.blocked(), false);
    playback.advance(800);
    assert.equal(playback.seeks, 1);
});
