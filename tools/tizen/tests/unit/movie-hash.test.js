'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

var BLOCK = 65536;

function setup(fetcher, stored) {
    var logs = [];
    var env = load(['keys.js', 'settings-store.js', 'movie-hash.js'], stored, {
        AbortController: AbortController,
        Log: { info: function (text) { logs.push(text); }, error: function (text) { logs.push(text); } },
        fetch: fetcher || function () { throw new Error('Unexpected HTTP'); },
    });
    env.logs = logs;
    env.hash = env.globals.MovieHash;
    return env;
}

function block(words) {
    var bytes = new Uint8Array(BLOCK);
    Object.keys(words).forEach(function (offset) {
        words[offset].forEach(function (value, n) { bytes[Number(offset) + n] = value; });
    });
    return bytes;
}

// Serves `file` with Range support like a provider; `calls` records the ranges.
function server(file, calls, mode) {
    return function (url, options) {
        var range = /bytes=(\d+)-(\d+)/.exec(options.headers.Range);
        calls.push({ url: url, from: Number(range[1]), to: Number(range[2]) });
        if (mode === 'hang') {
            return new Promise(function (resolve, reject) {
                options.signal.addEventListener('abort', function () { reject(new Error('aborted')); });
            });
        }
        var none = { get: function () { return null; } };
        if (mode === 'ignore') return Promise.resolve({ status: 200, headers: none, body: { cancel: function () { return Promise.resolve(); } } });
        if (mode === 'forbidden') return Promise.resolve({ status: 403, headers: none });
        var from = Number(range[1]);
        var to = Math.min(Number(range[2]), file.length - 1);
        var slice = file.slice(from, to + 1);
        return Promise.resolve({ status: 206, headers: { get: function (name) { return /content-range/i.test(name) ? 'bytes ' + from + '-' + to + '/' + file.length : null; } },
            arrayBuffer: function () { return Promise.resolve(slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength)); } });
    };
}

function movie(size) {
    var file = new Uint8Array(size);
    for (var i = 0; i < size; i++) file[i] = (i * 7 + 3) & 255;
    return file;
}

test('hash is the file size plus the little-endian 64-bit words of both blocks, as 16 hex digits', function () {
    var hash = setup().hash;
    assert.equal(hash.compute(block({}), block({}), BLOCK), '0000000000010000');
    // first: word0 = 1 and word1 = 2 * 2^32; last: word0 = 0xFFFFFFFF; size 100000 -> 0x3_0001_86A0.
    assert.equal(hash.compute(block({ 0: [1], 12: [2] }), block({ 0: [255, 255, 255, 255] }), 100000), '00000003000186a0');
    // Words are little-endian: bytes 01 02 are 0x0201, so 0x10000 + 0x201.
    assert.equal(hash.compute(block({ 0: [1, 2] }), block({}), BLOCK), '0000000000010201');
    // Words anywhere in the block count, including the last word of the last block.
    assert.equal(hash.compute(block({}), block({ 65528: [5] }), BLOCK), '0000000000010005');
});

test('hash wraps modulo 2^64 and a file or block under 64 KiB has no hash', function () {
    var hash = setup().hash;
    // 2^64 - 1 plus 65536 wraps to 65535.
    assert.equal(hash.compute(block({ 0: [255, 255, 255, 255, 255, 255, 255, 255] }), block({}), BLOCK), '000000000000ffff');
    assert.equal(hash.compute(new Uint8Array(1000), new Uint8Array(1000), 1000), '');
    assert.equal(hash.compute(block({}), new Uint8Array(10), 200000), '');
    assert.equal(hash.compute(block({}), block({}), 0), '');
});

test('prepare reads the first and last 64 KiB with two range requests, remembers the hash and logs no address', async function () {
    var calls = [];
    var file = movie(300000);
    var env = setup(server(file, calls));
    env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    var request = { id: 'movies:1', title: 'Fixture' };
    var hash = await env.hash.prepare(request, 'http://provider.example/movie/u/p/1.mkv');
    assert.equal(hash, env.hash.compute(file.slice(0, BLOCK), file.slice(300000 - BLOCK), 300000));
    assert.equal(request.movieHash, hash);
    assert.equal(calls.map(function (call) { return call.from + '-' + call.to; }).join(','), '0-65535,234464-299999');
    assert.equal(env.logs.join('|'), 'moviehash ok');
    // A replay, even after a reload, skips both requests.
    var again = setup(null, env.stored);
    again.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    var replay = { id: 'movies:1' };
    assert.equal(await again.hash.prepare(replay, 'http://provider.example/x'), hash);
    assert.equal(replay.movieHash, hash);
    assert.equal(calls.length, 2);
    assert.ok(!env.logs.join(' ').includes('provider.example'));
});

test('prepare is skipped without a key, for live TV and without an id, and never fetches', async function () {
    var env = setup();
    assert.equal(await env.hash.prepare({ id: 'movies:1' }, 'http://x/y'), '');
    env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    assert.equal(await env.hash.prepare({ live: true, id: 'live:1' }, 'http://x/y'), '');
    assert.equal(await env.hash.prepare({ title: 'No id' }, 'http://x/y'), '');
    assert.equal(env.logs.join('|'), 'moviehash skipped nokey|moviehash skipped noid');
});

test('prepare skips quietly when the file is small, ranges are ignored or the server refuses', async function () {
    var cases = [['small', movie(1000), 'size'], ['ignore', movie(300000), 'norange'], ['forbidden', movie(300000), 'http']];
    for (var i = 0; i < cases.length; i++) {
        var calls = [];
        var env = setup(server(cases[i][1], calls, cases[i][0]));
        env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
        var request = { id: 'movies:' + i };
        assert.equal(await env.hash.prepare(request, 'http://provider.example/a'), '');
        assert.equal(request.movieHash, undefined);
        assert.equal(env.logs.join('|'), 'moviehash skipped ' + cases[i][2]);
        // The failure is remembered for this session: playback is not delayed again.
        await env.hash.prepare(request, 'http://provider.example/a');
        assert.equal(calls.length, 1);
    }
});

test('prepare gives up after the budget and aborts the request', async function () {
    var calls = [];
    var env = setup(server(movie(300000), calls, 'hang'));
    env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    var started = Date.now();
    var hash = await env.hash.prepare({ id: 'movies:slow' }, 'http://provider.example/slow', { budget: 50 });
    assert.equal(hash, '');
    assert.ok(Date.now() - started < 1000);
    assert.equal(env.logs.join('|'), 'moviehash skipped timeout');
});
