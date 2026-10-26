'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

function harness() {
    var now = 0;
    var next = 0;
    var pending = {};
    var scene = { stops: 0, media: null, snapshot: null };
    var clock = {
        now: function () { return now; },
        setTimeout: function (callback, delay) {
            pending[++next] = { callback: callback, at: now + delay };
            return next;
        },
        clearTimeout: function (id) { delete pending[id]; },
    };
    scene.timer = load(['sleep-timer.js']).globals.SleepTimer({
        clock: clock,
        media: function () { return scene.media; },
        change: function (snapshot) { scene.snapshot = snapshot; },
        stop: function () { scene.stops++; },
    });
    scene.advance = function (ms) {
        var until = now + ms;
        for (;;) {
            var id = Object.keys(pending).filter(function (id) { return pending[id].at <= until; })[0];
            if (!id) break;
            var due = pending[id];
            delete pending[id];
            now = due.at;
            due.callback();
        }
        now = until;
    };
    scene.pending = function () { return Object.keys(pending).length; };
    return scene;
}

test('#22 the last minute warns, Keep watching adds the selected duration, expiry fires once', function () {
    var s = harness();
    s.timer.select(15);
    s.advance(14 * 60000 - 1);
    assert.equal(s.snapshot.warning, false);
    s.advance(1);
    assert.equal(s.snapshot.remaining, 60000);
    assert.equal(s.snapshot.warning, true);
    s.advance(10000);
    assert.equal(s.snapshot.remaining, 50000);
    s.timer.keepWatching();
    assert.equal(s.snapshot.remaining, 950000);
    assert.equal(s.snapshot.warning, false);
    s.advance(950000);
    assert.equal(s.stops, 1);
    assert.equal(s.snapshot.choice, 0);
    assert.equal(s.pending(), 0);
    s.advance(60000);
    assert.equal(s.stops, 1);
});

test('#22 replacing or cancelling a choice removes its old deadline', function () {
    var s = harness();
    s.timer.select(15);
    s.advance(60000);
    s.timer.select(30);
    s.advance(14 * 60000);
    assert.equal(s.stops, 0);
    assert.equal(s.snapshot.remaining, 16 * 60000);
    s.timer.cancel();
    assert.equal(s.pending(), 0);
    s.advance(90 * 60000);
    assert.equal(s.stops, 0);
    s.timer.select(15);
    s.timer.select(0);
    s.advance(15 * 60000);
    assert.equal(s.stops, 0);
});

test('#22 end of item follows media progress, speed and seeks, not elapsed wall time', function () {
    var s = harness();
    s.timer.select('end');
    s.advance(900000);
    assert.equal(s.stops, 0);
    assert.equal(s.snapshot.warning, false);
    s.media = { position: 180000, duration: 300000, rate: 2, ended: false };
    s.advance(1000);
    assert.equal(s.snapshot.remaining, 60000);
    assert.equal(s.snapshot.warning, true);
    s.advance(120000); // Paused media stays at the same position.
    assert.equal(s.stops, 0);
    s.media.position = 10000;
    s.advance(1000);
    assert.equal(s.snapshot.warning, false);
    s.media = null; // Another episode is loading; the choice survives.
    s.advance(1000);
    assert.equal(s.snapshot.choice, 'end');
    s.media = { position: 0, duration: 0, rate: 1, ended: false };
    s.advance(1000);
    assert.equal(s.stops, 0);
    s.media.ended = true;
    s.timer.check();
    assert.equal(s.stops, 1);
    assert.equal(s.pending(), 0);
});

test('#22 Keep watching turns end of item Off; Stop now fires immediately', function () {
    var s = harness();
    s.media = { position: 250000, duration: 300000, rate: 1, ended: false };
    s.timer.select('end');
    assert.equal(s.snapshot.warning, true);
    s.timer.keepWatching();
    assert.equal(s.snapshot.choice, 0);
    s.media.ended = true;
    s.advance(60000);
    assert.equal(s.stops, 0);
    s.timer.select(90);
    s.timer.stopNow();
    assert.equal(s.stops, 1);
    assert.equal(s.pending(), 0);
});
