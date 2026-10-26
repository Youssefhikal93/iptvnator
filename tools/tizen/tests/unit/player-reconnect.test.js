'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

// A fake clock: timers fire only when the test advances time.
function harness(settings) {
    var now = 0;
    var next = 1;
    var timers = {};
    var scene = { calls: [], position: 0, paused: false, pending: [] };
    function fire(limit) {
        for (;;) {
            var due = Object.keys(timers)
                .map(function (id) { return timers[id]; })
                .filter(function (timer) { return timer.at <= limit; })
                .sort(function (a, b) { return a.at - b.at || a.id - b.id; })[0];
            if (!due) break;
            now = due.at;
            if (due.every) due.at += due.every;
            else delete timers[due.id];
            due.fn();
        }
        now = limit;
    }
    var clock = {
        now: function () { return now; },
        setTimeout: function (fn, ms) { timers[next] = { id: next, fn: fn, at: now + ms }; return next++; },
        clearTimeout: function (id) { delete timers[id]; },
        setInterval: function (fn, ms) { timers[next] = { id: next, fn: fn, at: now + ms, every: ms }; return next++; },
        clearInterval: function (id) { delete timers[id]; },
    };
    var app = load(['player-reconnect.js']);
    scene.reconnect = app.globals.PlayerReconnect({
        timers: clock,
        settings: settings || {},
        position: function () { return scene.position; },
        paused: function () { return scene.paused; },
        begin: function (reason) { scene.calls.push('begin:' + reason); },
        open: function (done) { scene.calls.push('open'); scene.pending.push(done); },
        giveUp: function (reason) { scene.calls.push('giveUp:' + reason); },
    });
    scene.advance = function (ms) { fire(now + ms); };
    scene.timers = function () { return Object.keys(timers).length; };
    scene.answer = function (error) { scene.pending.shift()(error); };
    scene.last = function () { return scene.calls[scene.calls.length - 1]; };
    return scene;
}

test('#14 a lost stream waits 1, 2, 4, 8 and 15 s, then gives up with the last reason', function () {
    var s = harness();
    s.reconnect.lost('first');
    assert.equal(s.calls.join(), 'begin:first');
    s.advance(999);
    assert.equal(s.calls.length, 1);
    s.advance(1);
    assert.equal(s.calls.join(), 'begin:first,open');
    [2000, 4000, 8000, 15000].forEach(function (delay, i) {
        s.answer('fail' + i);
        s.advance(delay - 1);
        assert.equal(s.pending.length, 0, 'not before ' + delay);
        s.advance(1);
        assert.equal(s.pending.length, 1);
    });
    s.answer('last');
    assert.equal(s.calls.filter(function (c) { return c === 'open'; }).length, 5);
    assert.equal(s.last(), 'giveUp:last');
    assert.equal(s.reconnect.isActive(), false);
    assert.equal(s.timers(), 0);
});

test('#14 a try that plays ends the outage and a later loss starts over after a stable half minute', function () {
    var s = harness();
    s.reconnect.lost('x');
    s.advance(1000);
    s.answer(null);
    assert.equal(s.reconnect.isActive(), false);
    s.advance(30000); // stable: the budget is whole again
    s.reconnect.lost('y');
    assert.equal(s.last(), 'begin:y');
    s.advance(1000); // first delay again, not the second
    assert.equal(s.last(), 'open');
});

test('#14 a stream that keeps dropping right after reconnecting cannot loop forever', function () {
    var s = harness();
    for (var i = 0; i < 5; i++) {
        s.reconnect.lost('drop');
        s.advance(15000);
        s.answer(null);
        s.advance(1000); // plays, but never for the stable time
    }
    s.reconnect.lost('drop');
    assert.equal(s.last(), 'giveUp:drop');
});

test('#14 losses during an outage are ignored: one stream is reopened, never two', function () {
    var s = harness();
    s.reconnect.lost('a');
    s.reconnect.lost('b');
    s.advance(1000);
    s.reconnect.lost('c');
    assert.equal(s.calls.join(), 'begin:a,open');
    assert.equal(s.pending.length, 1);
});

test('#14 cancel stops the timers and ignores a try that answers late', function () {
    var s = harness();
    s.reconnect.watch();
    s.reconnect.lost('a');
    assert.equal(s.timers(), 1);
    s.reconnect.cancel();
    assert.equal(s.timers(), 0);
    s.advance(60000);
    assert.equal(s.calls.join(), 'begin:a');

    s.reconnect.lost('b');
    s.advance(1000);
    assert.equal(s.pending.length, 1);
    s.reconnect.cancel();
    s.answer('late');
    assert.equal(s.last(), 'open');
    assert.equal(s.timers(), 0);
    s.reconnect.lost('fresh channel'); // cancel gave the new channel a full budget
    s.advance(1000);
    assert.equal(s.last(), 'open');
});

test('#14 a success after cancel does not arm the stable timer', function () {
    var s = harness();
    s.reconnect.lost('a');
    s.advance(1000);
    s.reconnect.cancel();
    s.answer(null);
    assert.equal(s.timers(), 0);
});

test('#14 no progress for 10 s while playing counts as a loss; moving or paused does not', function () {
    var s = harness();
    s.reconnect.watch();
    for (var i = 0; i < 30; i++) { s.position += 500; s.advance(1000); }
    assert.equal(s.calls.length, 0);
    s.paused = true;
    s.advance(60000);
    assert.equal(s.calls.length, 0);
    s.paused = false;
    s.advance(9000);
    assert.equal(s.calls.length, 0);
    s.advance(1500);
    assert.equal(s.calls[0], 'begin:stalled');
    assert.equal(s.timers(), 1); // only the retry timer; the watch stopped
});

test('#14 unwatch stops the stall check', function () {
    var s = harness();
    s.reconnect.watch();
    s.reconnect.unwatch();
    s.advance(60000);
    assert.equal(s.calls.length, 0);
    assert.equal(s.timers(), 0);
});

test('#14 timings can be shortened for tests with a settings object', function () {
    var s = harness({ delays: [10, 20], stallMs: 100, checkMs: 10 });
    s.reconnect.watch();
    s.advance(100);
    assert.equal(s.calls[0], 'begin:stalled');
    s.advance(10);
    s.answer('f');
    s.advance(20);
    s.answer('g');
    assert.equal(s.last(), 'giveUp:g');
});
