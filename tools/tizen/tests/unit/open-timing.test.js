'use strict';

// #70: the open's timing line, and what is skipped when it is already known.
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var load = require('./sandbox');

function fixture(name) {
    return new Uint8Array(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'audio', name)));
}

function clockAt(times) {
    var at = 0;
    return function () { return times[Math.min(at++, times.length - 1)]; };
}

function timing(lines) {
    return load(['open-timing.js'], {}, { Log: { info: function (text) { lines.push(text); } } }).globals.OpenTiming;
}

test('the timing line names each step with its milliseconds and the total, once', async function () {
    var lines = [];
    // began 1000; resolve 1000..1120; hash skipped; prepare 1130..1930; total at 2000.
    var open = timing(lines).begin('film', clockAt([1000, 1000, 1120, 1130, 1930, 2000, 2000]));
    await open.run('resolve', '', function () { return Promise.resolve(); });
    await open.run('hash', 'cached', function () { return Promise.resolve(); });
    open.step('prepare')();
    open.finish();
    open.finish();
    assert.deepEqual(lines, ['OPEN timing film resolve=120 hash=cached prepare=800 total=1000']);
});

test('a step ends once, and a failing step is still timed', async function () {
    var open = timing([]).begin('episode', clockAt([0, 0, 5, 5, 9, 20]));
    var done = open.step('hash');
    done();
    done();
    await assert.rejects(open.run('sniff', '', function () { return Promise.reject(new Error('x')); }));
    assert.equal(open.line(), 'OPEN timing episode hash=5 sniff=4 total=20');
});

test('the line holds only fixed words and numbers, never an address or title', function () {
    var open = timing([]).begin('http://user:pass@host.test/movie/1.mkv', clockAt([0, 3]));
    open.step('http://secret.test/x?token=abc')();
    assert.equal(open.line(), 'OPEN timing ? ?=0 total=3');
    open = timing([]).begin('next', clockAt([0, 3]));
    open.step('m3u8')();
    assert.equal(open.line(), 'OPEN timing next m3u8=0 total=3');
});

test('the off tracker runs the work and logs nothing', async function () {
    var lines = [];
    var off = timing(lines).off;
    assert.equal(await off.run('hash', '', function () { return Promise.resolve(7); }), 7);
    off.step('x')();
    off.finish();
    assert.deepEqual(lines, []);
});

// ---- hash and sniff skip notes ------------------------------------------------

function hashEnv(stored, key) {
    var env = load(['movie-hash.js'], stored, {
        Log: { info: function () {}, error: function () {} },
        Prefs: { get: function () { return key; } },
    });
    return env.globals.MovieHash;
}

test('the hash step is skipped when the hash is saved, off without a key, and read otherwise', function () {
    var saved = { 'iptvnator-tv:movie-hashes': JSON.stringify({ 's1|movie:1': '0123456789abcdef' }) };
    assert.equal(hashEnv(saved, 'key').skipNote({ id: 'movie:1', subtitleId: 's1|movie:1' }), 'cached');
    assert.equal(hashEnv(saved, 'key').skipNote({ id: 'movie:2', subtitleId: 's1|movie:2' }), '');
    assert.equal(hashEnv(saved, '').skipNote({ id: 'movie:2' }), 'off');
    assert.equal(hashEnv(saved, 'key').skipNote({ id: 'x', live: true }), 'off');
});

function server(size) {
    var reads = [];
    return {
        reads: reads,
        fetch: function (url, options) {
            var range = /bytes=(\d+)-(\d+)/.exec(options.headers.Range);
            reads.push(options.headers.Range);
            var bytes = fixture('tracks.mkv.head');
            return Promise.resolve({ status: 206, headers: { get: function () { return 'bytes ' + range[1] + '-' + range[2] + '/' + size; } },
                arrayBuffer: function () { return Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); } });
        },
    };
}

function sniffEnv(fake, stored) {
    return load(['media-sniff.js'], stored || {}, {
        AbortController: AbortController, setTimeout: setTimeout, clearTimeout: clearTimeout,
        Log: { info: function () {} }, fetch: fake.fetch,
    });
}

function episode(n) {
    return { id: 'ep:' + n, subtitleId: 's1|ep:' + n, episodes: { show: 's1|show:9' } };
}

test('the sniff of a known file is skipped (cached)', async function () {
    var fake = server(9000000);
    var sniff = sniffEnv(fake).globals.MediaSniff;
    var request = { id: 'movie:1' };
    assert.equal(sniff.skipNote(request), '');
    await sniff.prepare(request, 'http://x.test/1.mkv');
    assert.equal(fake.reads.length, 1);
    assert.equal(sniff.skipNote({ id: 'movie:1' }), 'cached');
    await sniff.prepare({ id: 'movie:1' }, 'http://x.test/1.mkv');
    assert.equal(fake.reads.length, 1);
});

test('a show whose episodes gave the same tracks twice is not read again', async function () {
    var fake = server(9000000);
    var env = sniffEnv(fake);
    var sniff = env.globals.MediaSniff;
    await sniff.prepare(episode(1), 'http://x.test/1.mkv');
    assert.equal(sniff.skipNote(episode(2)), '');
    await sniff.prepare(episode(2), 'http://x.test/2.mkv');
    var reads = fake.reads.length;
    var third = episode(3);
    assert.equal(sniff.skipNote(third), 'show');
    await sniff.prepare(third, 'http://x.test/3.mkv');
    assert.equal(fake.reads.length, reads);
    assert.deepEqual(JSON.parse(JSON.stringify(third.fileAudio.map(function (t) { return t.codec; }))), ['aac', 'ac3', 'dts']);
    // The skipped episode adds nothing to the saved lists.
    assert.deepEqual(Object.keys(JSON.parse(env.stored['iptvnator-tv:sniff-tracks'])).sort(), ['s1|ep:1', 's1|ep:2']);
});

test('the same episode read twice does not make a show shared, and a different format restarts the count', async function () {
    var fake = server(9000000);
    var env = sniffEnv(fake);
    var sniff = env.globals.MediaSniff;
    await sniff.prepare(episode(1), 'http://x.test/1.mkv');
    delete env.globals.MediaSniff; // keep the module; only forget its in-memory notes below
    var stored = JSON.parse(env.stored['iptvnator-tv:sniff-shows']);
    assert.equal(stored['s1|show:9'].n, 1);
    // The episode's own note was lost; reading it again is still one episode.
    delete env.stored['iptvnator-tv:sniff-tracks'];
    var again = sniffEnv(fake, { 'iptvnator-tv:sniff-shows': env.stored['iptvnator-tv:sniff-shows'] }).globals.MediaSniff;
    await again.prepare(episode(1), 'http://x.test/1.mkv');
    assert.equal(again.skipNote(episode(2)), '');
    // A different track list resets the show.
    var other = JSON.stringify({ 's1|show:9': { audio: [{ codec: 'aac', language: 'eng', channels: 2 }], n: 1, last: 's1|ep:0' } });
    var changed = sniffEnv(fake, { 'iptvnator-tv:sniff-shows': other });
    await changed.globals.MediaSniff.prepare(episode(7), 'http://x.test/7.mkv');
    var now = JSON.parse(changed.stored['iptvnator-tv:sniff-shows'])['s1|show:9'];
    assert.equal(now.n, 1);
    assert.equal(now.audio.length, 3);
});

test('the show notes stay bounded', async function () {
    var fake = server(9000000);
    var env = sniffEnv(fake);
    var sniff = env.globals.MediaSniff;
    for (var n = 0; n < 45; n++) {
        await sniff.prepare({ id: 'e:' + n, subtitleId: 'e:' + n, episodes: { show: 'show:' + n } }, 'http://x.test/' + n + '.mkv');
    }
    assert.equal(Object.keys(JSON.parse(env.stored['iptvnator-tv:sniff-shows'])).length, 30);
});

// ---- the sound route of a show --------------------------------------------------

function routes(stored) {
    return load(['player-tracks.js', 'audio-route.js'], stored || {});
}

var SOURCE = { via: 'avplay', url: 'file.mkv', converted: [{ name: 'm3u8', url: 'id.m3u8' }, { name: 'ts', url: 'id.ts' }] };
var DTS = [{ codec: 'dts', language: 'eng', channels: 6 }];
var AAC = [{ codec: 'aac', language: 'eng', channels: 2 }];

function first(plan) {
    return plan.map(function (step) { return step.name; }).join(' ');
}

test('a converted address that worked for one episode is where the show\'s next episodes start', function () {
    var env = routes();
    var one = { id: 'ep:1', subtitleId: 's1|ep:1', fileAudio: DTS, episodes: { show: 's1|show:9' } };
    env.globals.AudioRoute.remember(one, 'ts');
    var two = { id: 'ep:2', subtitleId: 's1|ep:2', fileAudio: DTS, episodes: { show: 's1|show:9' } };
    assert.equal(first(env.globals.AudioRoute.plan(two, SOURCE, 'file.mkv')), 'ts m3u8 file');
    // Another show, or a header with playable sound, is not moved.
    var other = { id: 'ep:3', subtitleId: 's1|ep:3', fileAudio: DTS, episodes: { show: 's1|show:10' } };
    assert.equal(first(env.globals.AudioRoute.plan(other, SOURCE, 'file.mkv')), 'm3u8 ts file');
    var playable = Object.assign({}, two, { fileAudio: AAC });
    assert.equal(first(env.globals.AudioRoute.plan(playable, SOURCE, 'file.mkv')), 'file');
    // The episode's own note wins.
    env.globals.AudioRoute.remember(two, 'none');
    assert.equal(first(env.globals.AudioRoute.plan(two, SOURCE, 'file.mkv')), 'file');
});

test('a movie keeps no show note, and a "none" or "original" answer is never shared', function () {
    var env = routes();
    env.globals.AudioRoute.remember({ id: 'movie:1', subtitleId: 's1|movie:1' }, 'ts');
    env.globals.AudioRoute.remember({ id: 'ep:1', subtitleId: 's1|ep:1', episodes: { show: 's1|show:9' } }, 'none');
    env.globals.AudioRoute.remember({ id: 'ep:2', subtitleId: 's1|ep:2', episodes: { show: 's1|show:9' } }, 'original');
    assert.deepEqual(Object.keys(JSON.parse(env.stored['iptvnator-tv:audio-route'])).filter(function (name) { return name.indexOf('show:') === 0; }), []);
});
