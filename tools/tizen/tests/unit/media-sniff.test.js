'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var load = require('./sandbox');

// Headers of two ffmpeg files: tracks.mkv holds Arabic AAC 2.0, English AC-3
// 5.1 and English DTS 5.1; tracks.mp4 Arabic AAC 2.0 and Swedish AC-3 5.1.
function fixture(name) {
    return new Uint8Array(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'audio', name)));
}

function sniff(stored, globals) {
    return load(['media-sniff.js'], stored || {}, Object.assign({ Log: { info: function () {} } }, globals || {})).globals.MediaSniff;
}

function plain(list) {
    return JSON.parse(JSON.stringify(list));
}

test('a Matroska header lists each sound track with its codec, language and channels', function () {
    assert.deepEqual(plain(sniff().tracks(fixture('tracks.mkv.head'))), [
        { codec: 'aac', language: 'ara', channels: 2 },
        { codec: 'ac3', language: 'eng', channels: 6 },
        { codec: 'dts', language: 'eng', channels: 6 },
    ]);
});

test('an MP4 header lists its sound tracks, with AC-3 channels from its own box', function () {
    assert.deepEqual(plain(sniff().tracks(fixture('tracks.mp4.head'))), [
        { codec: 'aac', language: 'ara', channels: 2 },
        { codec: 'ac3', language: 'swe', channels: 6 },
    ]);
});

test('a header cut short still gives the tracks it holds, and other files give none', function () {
    var cut = fixture('tracks.mkv.head');
    var at = Buffer.from(cut).indexOf('A_DTS');
    assert.deepEqual(plain(sniff().tracks(cut.subarray(0, at))).map(function (t) { return t.codec; }), ['aac', 'ac3']);
    assert.equal(sniff().tracks(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), null);
    assert.equal(sniff().tracks(fixture('tracks.mp4.head').subarray(0, 40)), null, 'no moov box in the block');
});

function server(file, size) {
    var reads = [];
    return {
        reads: reads,
        fetch: function (url, options) {
            var range = /bytes=(\d+)-(\d+)/.exec(options.headers.Range);
            reads.push(options.headers.Range);
            var from = Number(range[1]);
            var bytes = file(from);
            return Promise.resolve({ status: 206, headers: { get: function () { return 'bytes ' + from + '-' + range[2] + '/' + size; } },
                arrayBuffer: function () { return Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); } });
        },
    };
}

function api(fake, lines, stored) {
    return sniff(stored || {}, {
        AbortController: AbortController, setTimeout: setTimeout, clearTimeout: clearTimeout,
        Log: { info: function (text) { lines.push(text); } },
        fetch: fake.fetch,
    });
}

test('a file is read once before AVPlay opens it, and a live channel never', async function () {
    var lines = [];
    var fake = server(function () { return fixture('tracks.mkv.head'); }, 9000000);
    var sniffer = api(fake, lines);
    var request = { id: 'series:7' };
    await sniffer.prepare({ id: 'live:1', live: true }, 'http://example.test/1.ts');
    await sniffer.prepare(request, 'http://example.test/7.mkv');
    assert.deepEqual(fake.reads, ['bytes=0-65535']);
    assert.deepEqual(lines, ['media mkv audio aac,ac3,dts']);
    assert.equal(request.fileAudio.length, 3);
    var again = { id: 'series:7' };
    await sniffer.prepare(again, 'http://example.test/7.mkv');
    assert.equal(fake.reads.length, 1);
    assert.equal(again.fileAudio[2].codec, 'dts');
});

test('the block MovieHash already read is used instead of a second request', async function () {
    var lines = [];
    var fake = server(function () { throw new Error('no read expected'); }, 9000000);
    var request = { id: 'movies:3', fileHead: { bytes: fixture('tracks.mp4.head'), size: 9000000 } };
    await api(fake, lines).prepare(request, 'http://example.test/3.mp4');
    assert.deepEqual(fake.reads, []);
    assert.equal(request.fileHead, undefined);
    assert.deepEqual(plain(request.fileAudio).map(function (t) { return t.language; }), ['ara', 'swe']);
});

test('a Matroska file whose track list is not at its start is read at its end', async function () {
    var lines = [];
    var start = new Uint8Array(65536);
    start.set([0x1a, 0x45, 0xdf, 0xa3, 0x80]);
    var fake = server(function (from) { return from ? fixture('tracks.mkv.head') : start; }, 9000000);
    var request = { id: 'movies:4' };
    await api(fake, lines).prepare(request, 'http://example.test/4.mkv');
    assert.deepEqual(fake.reads, ['bytes=0-65535', 'bytes=8934464-8999999']);
    assert.equal(request.fileAudio.length, 3);
});

test('a file without a track list is remembered as unknown and not read again', async function () {
    var lines = [];
    var fake = server(function () { return new Uint8Array(100); }, 100);
    var sniffer = api(fake, lines);
    var request = { id: 'movies:5' };
    await sniffer.prepare(request, 'http://example.test/5.avi');
    await sniffer.prepare({ id: 'movies:5' }, 'http://example.test/5.avi');
    assert.equal(request.fileAudio, null);
    assert.deepEqual(lines, ['media unknown audio not found']);
    assert.equal(fake.reads.length, 1);
});

test('the same id on two sources is two files: each is read, and old id-only notes are ignored', async function () {
    var lines = [];
    var fake = server(function () { return fixture('tracks.mkv.head'); }, 9000000);
    var sniffer = api(fake, lines, { 'iptvnator-tv:sniff-tracks': JSON.stringify({ 'movie:7': null }) });
    var first = { id: 'movie:7', subtitleId: 'a|movie:7' };
    var second = { id: 'movie:7', subtitleId: 'b|movie:7' };
    await sniffer.prepare(first, 'http://a.test/7.mkv');
    await sniffer.prepare(second, 'http://b.test/7.mkv');
    assert.equal(fake.reads.length, 2);
    assert.equal(first.fileAudio.length, 3);
    assert.equal(second.fileAudio.length, 3);
});
