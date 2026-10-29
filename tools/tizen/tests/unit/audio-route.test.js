'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

function route(stored) {
    var env = load(['player-tracks.js', 'audio-route.js'], stored || {});
    return { api: env.globals.AudioRoute, stored: env.stored };
}

var SOURCE = { via: 'avplay', url: 'file.mkv', converted: [{ name: 'm3u8', url: 'id.m3u8' }, { name: 'ts', url: 'id.ts' }] };
var DTS = [{ codec: 'dts', language: 'eng', channels: 6 }];

function names(list) {
    return list.map(function (step) {
        return step.name + (step.needsSound ? '?' : '') + (step.silent ? '!' : '') + (step.retry ? '~' : '');
    }).join(' ');
}

test('a DTS-only file tries the converted addresses before the file, which then says why it is silent', function () {
    assert.equal(names(route().api.plan({ id: 'movie:1', fileAudio: DTS }, SOURCE, 'file.mkv')), 'm3u8? ts? file!');
});

test('a file with playable sound opens as it is; an unread header may retry after five seconds', function () {
    var api = route().api;
    var mixed = DTS.concat([{ codec: 'aac', language: 'ara', channels: 2 }]);
    assert.equal(names(api.plan({ id: 'movie:1', fileAudio: mixed }, SOURCE, 'file.mkv')), 'file');
    assert.equal(names(api.plan({ id: 'movie:1', fileAudio: null }, SOURCE, 'file.mkv')), 'file~');
    assert.equal(names(api.plan({ id: 'movie:1', fileAudio: null, audioRetry: true }, SOURCE, 'file.mkv')), 'm3u8? ts? file!');
});

test('what worked is where the file starts next time', function () {
    var env = route();
    env.api.remember({ id: 'movie:1' }, 'ts');
    assert.equal(names(env.api.plan({ id: 'movie:1', fileAudio: DTS }, SOURCE, 'file.mkv')), 'ts? file!');
    env.api.remember({ id: 'movie:1' }, 'file');
    assert.equal(names(env.api.plan({ id: 'movie:1', fileAudio: DTS }, SOURCE, 'file.mkv')), 'file!');
    env.api.remember({ id: 'movie:1' }, 'original');
    assert.equal(names(env.api.plan({ id: 'movie:1', fileAudio: DTS }, SOURCE, 'file.mkv')), 'file');
    assert.deepEqual(JSON.parse(env.stored['iptvnator-tv:audio-route']), { 'movie:1': 'original' });
});

test('live channels, M3U files and the viewer\'s own choice open only the file', function () {
    var api = route().api;
    assert.equal(names(api.plan({ id: 'live:1', live: true }, SOURCE, 'x')), 'file');
    assert.equal(names(api.plan({ id: 'movie:1', fileAudio: DTS }, { via: 'avplay', url: 'x' }, 'x')), 'file');
    assert.equal(names(api.plan({ id: 'movie:1', fileAudio: DTS, audioRoute: 'original' }, SOURCE, 'x')), 'file');
    assert.equal(api.offered({ id: 'movie:1', sources: [SOURCE] }), true);
    assert.equal(api.offered({ id: 'movie:1', sources: [{ via: 'avplay', url: 'x' }] }), false);
});

test('the message names the format the file holds, or says it plainly', function () {
    var api = route().api;
    assert.match(api.message({ fileAudio: DTS }), /\(DTS\) isn't supported by Samsung TVs/);
    assert.match(api.message({ fileAudio: null }), /isn't supported by this TV/);
});

test('an old "no sound" note does not silence a file whose header names playable sound; forget drops the note', function () {
    var env = route();
    var aac = [{ codec: 'aac', language: 'ara', channels: 2 }];
    env.api.remember({ id: 'movie:1' }, 'file');
    assert.equal(names(env.api.plan({ id: 'movie:1', fileAudio: aac }, SOURCE, 'file.mkv')), 'file');
    assert.equal(names(env.api.plan({ id: 'movie:1', fileAudio: null }, SOURCE, 'file.mkv')), 'file!');
    env.api.forget({ id: 'movie:1' });
    assert.deepEqual(JSON.parse(env.stored['iptvnator-tv:audio-route']), {});
    assert.equal(names(env.api.plan({ id: 'movie:1', fileAudio: null }, SOURCE, 'file.mkv')), 'file~');
});
