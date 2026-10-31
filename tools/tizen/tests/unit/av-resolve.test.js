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

function resolve(status) {
    var lines = [];
    var env = load(['av-resolve.js'], {}, {
        Log: { info: function (text) { lines.push(text); }, error: function (text) { lines.push(text); } },
        URL: URL,
        fetch: function () { return Promise.resolve({ status: status, redirected: false, url: 'http://tv.example:8080/movie/u/p/1.mkv' }); },
    });
    return env.globals.AvResolve.final('http://tv.example:8080/movie/u/p/1.mkv').then(function (result) {
        return { result: result, lines: lines };
    });
}

test('a server that refuses the redirect check (401, 403) still gets the link opened by the player', async function () {
    for (var status of [401, 403]) {
        var seen = await resolve(status);
        assert.equal(seen.result.url, 'http://tv.example:8080/movie/u/p/1.mkv');
        assert.equal(seen.result.error, undefined);
        assert.equal(seen.lines[0], 'AVPlay redirect check refused (HTTP ' + status + ') tv.example:8080, opening the link itself');
    }
});

test('a busy or missing stream (503, 404) is still an error before the player opens', async function () {
    assert.equal((await resolve(503)).result.error, 'HTTP 503');
    assert.equal((await resolve(404)).result.error, 'HTTP 404');
});

test('a later look is marked as such', function () {
    var lines = [];
    var env = load(['av-resolve.js'], {}, { Log: { info: function (text) { lines.push(text); } } });
    env.globals.AvResolve.tracks({ getTotalTrackInfo: function () { return [{ type: 'AUDIO', extra_info: '{"fourCC":"AC3"}' }]; } }, null, 'after 5s');
    assert.equal(lines[0], 'AVPlay tracks after 5s AUDIO:-/AC3');
});
