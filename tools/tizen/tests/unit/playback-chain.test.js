'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

// A fake clock for the chain's global timers: they fire only when the test
// advances time. Promise callbacks settle through flush().
function harness() {
    var now = 0;
    var next = 1;
    var timers = {};
    var scene = { events: [], starts: [] };
    function fire(limit) {
        for (;;) {
            var due = Object.keys(timers)
                .map(function (id) { return timers[id]; })
                .filter(function (timer) { return timer.at <= limit; })
                .sort(function (a, b) { return a.at - b.at || a.id - b.id; })[0];
            if (!due) break;
            now = due.at;
            delete timers[due.id];
            due.fn();
        }
        now = limit;
    }
    var app = load(['playback-chain.js'], {}, {
        Date: { now: function () { return now; } },
        setTimeout: function (fn, ms) { timers[next] = { id: next, fn: fn, at: now + ms }; return next++; },
        clearTimeout: function (id) { delete timers[id]; },
    });
    scene.chain = app.globals.PlaybackChain();
    scene.flush = function () {
        return new Promise(function (resolve) { setImmediate(resolve); });
    };
    scene.advance = function (ms) {
        fire(now + ms);
        return scene.flush();
    };
    scene.timers = function () { return Object.keys(timers).length; };
    // A starter that records itself and waits for the test to answer.
    scene.starter = function (name) {
        var entry = { name: name, start: function (finish) { scene.starts.push(name); entry.finish = finish; } };
        return entry;
    };
    scene.hooks = function (tag) {
        var prefix = tag ? tag + ':' : '';
        return {
            ready: function (name, ms) { scene.events.push(prefix + 'ready:' + name + ':' + ms); },
            failed: function (name, error, ms) { scene.events.push(prefix + 'failed:' + name + ':' + error + ':' + ms); },
            giveUp: function (kind) { scene.events.push(prefix + 'giveUp:' + kind); },
        };
    };
    return scene;
}

test('players are tried in the given order until one plays', async function () {
    var scene = harness();
    var a = scene.starter('mpegts');
    var b = scene.starter('hls');
    var c = scene.starter('avplay');
    scene.chain.run([a, b, c], scene.hooks());
    await scene.flush();
    a.finish('mpegts.js unsupported');
    await scene.flush();
    b.finish('manifestLoadError');
    await scene.flush();
    c.finish(null);
    await scene.flush();
    assert.deepEqual(scene.starts, ['mpegts', 'hls', 'avplay']);
    assert.deepEqual(scene.events, [
        'failed:mpegts:mpegts.js unsupported:0',
        'failed:hls:manifestLoadError:0',
        'ready:avplay:0',
    ]);
    assert.equal(scene.timers(), 0, 'a played attempt clears its timeout');
});

test('movies try AVPlay, then hls.js, then video in the request order', async function () {
    var scene = harness();
    var order = ['avplay', 'hls', 'video'].map(scene.starter);
    scene.chain.run(order, scene.hooks());
    for (var i = 0; i < order.length; i++) {
        await scene.flush();
        order[i].finish('prepare ' + i);
    }
    await scene.flush();
    assert.deepEqual(scene.starts, ['avplay', 'hls', 'video']);
    assert.equal(scene.events[scene.events.length - 1], 'giveUp:offline');
});

test('a player that never answers fails with timeout after 20 s, then the next one starts', async function () {
    var scene = harness();
    var a = scene.starter('mpegts');
    var b = scene.starter('hls');
    scene.chain.run([a, b], scene.hooks());
    await scene.advance(19999);
    assert.deepEqual(scene.starts, ['mpegts']);
    assert.deepEqual(scene.events, []);
    await scene.advance(1);
    assert.deepEqual(scene.events, ['failed:mpegts:timeout:20000']);
    assert.deepEqual(scene.starts, ['mpegts', 'hls']);
    // A late answer from the timed-out player is ignored.
    a.finish(null);
    await scene.flush();
    assert.deepEqual(scene.events, ['failed:mpegts:timeout:20000']);
});

test('a starter that throws counts as a failed attempt', async function () {
    var scene = harness();
    var broken = { name: 'avplay', start: function () { throw new TypeError('no avplay'); } };
    var b = scene.starter('video');
    scene.chain.run([broken, b], scene.hooks());
    await scene.flush();
    assert.deepEqual(scene.events, ['failed:avplay:TypeError:0']);
    assert.deepEqual(scene.starts, ['video']);
});

test('a 503 retries the same player once after 2 s without trying the next', async function () {
    var scene = harness();
    var a = scene.starter('mpegts');
    var b = scene.starter('hls');
    scene.chain.run([a, b], scene.hooks());
    await scene.flush();
    a.finish('networkError HTTP 503');
    await scene.flush();
    assert.deepEqual(scene.starts, ['mpegts'], 'waits before the retry');
    await scene.advance(1999);
    assert.deepEqual(scene.starts, ['mpegts']);
    await scene.advance(1);
    assert.deepEqual(scene.starts, ['mpegts', 'mpegts']);
    a.finish(null);
    await scene.flush();
    assert.deepEqual(scene.events, ['failed:mpegts:networkError HTTP 503:0', 'ready:mpegts:0']);
});

test('a second 503 gives up as busy; other players are not tried', async function () {
    var scene = harness();
    var a = scene.starter('mpegts');
    var b = scene.starter('hls');
    scene.chain.run([a, b], scene.hooks());
    await scene.flush();
    a.finish('503');
    await scene.flush();
    await scene.advance(2000);
    a.finish('503');
    await scene.flush();
    assert.deepEqual(scene.starts, ['mpegts', 'mpegts']);
    assert.deepEqual(scene.events, ['failed:mpegts:503:0', 'failed:mpegts:503:0', 'giveUp:busy']);
});

test('the retry that fails differently falls through to the next player', async function () {
    var scene = harness();
    var a = scene.starter('mpegts');
    var b = scene.starter('hls');
    scene.chain.run([a, b], scene.hooks());
    await scene.flush();
    a.finish('503');
    await scene.flush();
    await scene.advance(2000);
    a.finish('bufferStalledError');
    await scene.flush();
    assert.deepEqual(scene.starts, ['mpegts', 'mpegts', 'hls']);
});

test('a newer run cancels the older chain, which then ignores late answers', async function () {
    var scene = harness();
    var old = scene.starter('mpegts');
    var oldNext = scene.starter('hls');
    scene.chain.run([old, oldNext], scene.hooks('old'));
    await scene.flush();
    var fresh = scene.starter('avplay');
    scene.chain.run([fresh], scene.hooks('new'));
    await scene.flush();
    old.finish('late failure');
    await scene.flush();
    assert.deepEqual(scene.starts, ['mpegts', 'avplay'], 'the old chain does not move on');
    assert.deepEqual(scene.events, []);
    fresh.finish(null);
    await scene.flush();
    assert.deepEqual(scene.events, ['new:ready:avplay:0']);
});

test('cancel() stops a chain waiting to retry a 503', async function () {
    var scene = harness();
    var a = scene.starter('mpegts');
    scene.chain.run([a], scene.hooks());
    await scene.flush();
    a.finish('HTTP 503');
    await scene.flush();
    scene.chain.cancel();
    await scene.advance(5000);
    assert.deepEqual(scene.starts, ['mpegts']);
    assert.deepEqual(scene.events, ['failed:mpegts:HTTP 503:0']);
});

test('cancel() drops a playing answer and marks earlier tokens stale', async function () {
    var scene = harness();
    var a = scene.starter('video');
    scene.chain.run([a], scene.hooks());
    await scene.flush();
    var token = scene.chain.session();
    assert.equal(scene.chain.stale(token), false);
    scene.chain.cancel();
    assert.equal(scene.chain.stale(token), true);
    a.finish(null);
    await scene.flush();
    assert.deepEqual(scene.events, []);
});

test('an empty request is offline at once', async function () {
    var scene = harness();
    scene.chain.run([], scene.hooks());
    await scene.flush();
    assert.deepEqual(scene.events, ['giveUp:offline']);
});
