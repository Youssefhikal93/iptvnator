'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

function sniff(stored, globals) {
    return load(['media-sniff.js'], stored || {}, Object.assign({ Log: { info: function () {} } }, globals || {})).globals.MediaSniff;
}

function block(prefix, text) {
    var bytes = new Uint8Array(65536);
    bytes.set(prefix, 0);
    for (var i = 0; i < text.length; i++) bytes[200 + i] = text.charCodeAt(i);
    return bytes;
}

test('a Matroska file names its sound codecs in the first block', function () {
    var found = sniff().scan(block([0x1a, 0x45, 0xdf, 0xa3], 'V_MPEG4/ISO/AVC....A_DTS....A_AAC'));
    assert.equal(sniff().line(found), 'media mkv audio aac,dts');
});

test('an MP4 file with its index at the end shows the sound from the last block', function () {
    var first = block([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70], '');
    var found = sniff().scan(first, block([], 'stsd....ec-3....'));
    assert.equal(sniff().line(found), 'media mp4 audio eac3');
});

test('nothing recognised is said as such', function () {
    assert.equal(sniff().line(sniff().scan(block([1, 2, 3, 4], 'hello'))), 'media unknown audio none found');
});

test('only a flagged file is read, once, before AVPlay opens it', async function () {
    var reads = [];
    var lines = [];
    var file = block([0x1a, 0x45, 0xdf, 0xa3], 'A_TRUEHD');
    var api = sniff({}, {
        AbortController: AbortController, setTimeout: setTimeout, clearTimeout: clearTimeout,
        Log: { info: function (text) { lines.push(text); } },
        fetch: function (url, options) {
            reads.push(options.headers.Range);
            return Promise.resolve({ status: 206, headers: { get: function () { return 'bytes 0-65535/9000000'; } },
                arrayBuffer: function () { return Promise.resolve(file.buffer); } });
        },
    });
    await api.prepare({ id: 'series:7' }, 'http://example.test/7.mkv');
    assert.equal(reads.length, 0);
    api.flag({ id: 'series:7' });
    api.flag({ id: 'live:1', live: true });
    await api.prepare({ id: 'series:7' }, 'http://example.test/7.mkv');
    assert.deepEqual(reads, ['bytes=0-65535', 'bytes=8934464-8999999']);
    assert.deepEqual(lines, ['media mkv audio truehd']);
    await api.prepare({ id: 'series:7' }, 'http://example.test/7.mkv');
    assert.equal(reads.length, 2);
});
