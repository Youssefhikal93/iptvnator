'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

function tracksLine(total, expected) {
    var lines = [];
    var env = load(['av-resolve.js'], {}, {
        Log: { info: function (text) { lines.push(text); }, error: function (text) { lines.push(text); } },
    });
    env.globals.AvResolve.tracks({ getTotalTrackInfo: function () { return total; } }, expected);
    return lines[0];
}

test('the tracks line names each codec and the audio the provider reports', function () {
    var line = tracksLine([
        { type: 'VIDEO', extra_info: '{"fourCC":"H264"}' },
        { type: 'AUDIO', extra_info: '{"language":"eng","fourCC":"AAC"}' },
    ], { codec_name: 'aac', profile: 'LC', channels: 2 });
    assert.equal(line, 'AVPlay tracks VIDEO:-/H264 AUDIO:eng/AAC (provider audio aac LC 2ch)');
});

test('a sound the TV cannot play shows as no AUDIO track next to the provider audio', function () {
    var line = tracksLine([{ type: 'VIDEO', extra_info: '{"fourCC":"H264"}' }], { codec_name: 'dts', channels: 6 });
    assert.equal(line, 'AVPlay tracks VIDEO:-/H264 (provider audio dts 6ch)');
});

test('without provider facts or codecs the line stays as before', function () {
    assert.equal(tracksLine([{ type: 'VIDEO', extra_info: 'plain text' }]), 'AVPlay tracks VIDEO:-');
});
