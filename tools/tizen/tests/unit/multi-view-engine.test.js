'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

// HTML media and vendor engines are the browser/network boundary.
function app() {
    var hls = [];
    var transport = [];
    var statuses = [];
    var logs = [];
    var video = {
        paused: false,
        play: function () { return Promise.resolve(); },
        pause: function () { this.paused = true; },
        load: function () {},
        removeAttribute: function () {},
    };
    function Hls() { hls.push(this); this.destroyed = false; }
    Hls.isSupported = function () { return true; };
    Hls.Events = { ERROR: 'error' };
    Hls.prototype.on = function (event, callback) { this.error = callback; };
    Hls.prototype.loadSource = function () {};
    Hls.prototype.attachMedia = function () {};
    Hls.prototype.destroy = function () { this.destroyed = true; };
    var env = load(['playback-chain.js', 'player-tracks.js', 'multi-view-engine.js'], {}, {
        Hls: Hls,
        mpegts: {
            Events: { ERROR: 'error' },
            isSupported: function () { return true; },
            createPlayer: function () {
                var player = {
                    destroyed: false,
                    on: function (event, callback) { this.error = callback; },
                    attachMediaElement: function () {},
                    load: function () {},
                    play: function () { video.onplaying(); return Promise.resolve(); },
                    destroy: function () { this.destroyed = true; },
                };
                transport.push(player);
                return player;
            },
        },
        Log: { info: function (line) { logs.push(line); }, error: function (line) { logs.push(line); } },
    });
    var engine = env.globals.MultiViewEngine(video, {
        title: 'Channel One', live: true, sources: [
            { via: 'hls', url: 'http://private.test/login/secret.m3u8' },
            { via: 'avplay', url: 'http://private.test/login/secret.ts' },
            { via: 'mpegts', url: 'http://private.test/login/secret.ts' },
        ],
    }, function (status) { statuses.push(status); });
    return { engine: engine, video: video, hls: hls, transport: transport, statuses: statuses, logs: logs };
}

async function settle() { for (var i = 0; i < 6; i++) await Promise.resolve(); }

test('#77 a late HLS error after fallback cannot stop the playing replacement', async function () {
    var p = app();
    try {
        p.hls[0].error('error', { fatal: true });
        await settle();
        assert.equal(p.hls[0].destroyed, true);
        assert.deepEqual(p.statuses, ['loading', 'playing']);
        p.hls[0].error('error', { fatal: true });
        assert.equal(p.transport[0].destroyed, false);
        assert.deepEqual(p.statuses, ['loading', 'playing']);
        p.transport[0].error('network', 'http://private.test/login/secret.ts');
        assert.equal(p.transport[0].destroyed, true);
        assert.deepEqual(p.statuses, ['loading', 'playing', 'refused']);
        assert.ok(p.logs.every(function (line) { return line.includes('Channel One') && !/private|secret|http/.test(line); }));
    } finally { p.engine.stop(); }
});

test('#77 stopping a loading tile releases media and ignores late errors and ready events', async function () {
    var p = app();
    var ready = p.video.onplaying;
    p.engine.stop();
    p.hls[0].error('error', { fatal: true });
    ready();
    await settle();
    assert.equal(p.hls[0].destroyed, true);
    assert.equal(p.video.paused, true);
    assert.equal(p.transport.length, 0);
    assert.deepEqual(p.statuses, ['loading']);
});
