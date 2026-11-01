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
        return step.name + (step.direct ? '^' : '') + (step.needsSound ? '?' : '') + (step.silent ? '!' : '') + (step.retry ? '~' : '');
    }).join(' ');
}

test('a DTS-only file tries the converted addresses before the file, which then says why it is silent', function () {
    assert.equal(names(route().api.plan({ id: 'movie:1', fileAudio: DTS }, SOURCE, 'file.mkv')), 'm3u8^? ts? file!');
});

test('a file with playable sound opens as it is; an unread header may retry after five seconds', function () {
    var api = route().api;
    var mixed = DTS.concat([{ codec: 'aac', language: 'ara', channels: 2 }]);
    assert.equal(names(api.plan({ id: 'movie:1', fileAudio: mixed }, SOURCE, 'file.mkv')), 'file');
    assert.equal(names(api.plan({ id: 'movie:1', fileAudio: null }, SOURCE, 'file.mkv')), 'file~');
    assert.equal(names(api.plan({ id: 'movie:1', fileAudio: null, audioRetry: true }, SOURCE, 'file.mkv')), 'm3u8^? ts? file!');
});

test('what worked is where the file starts next time', function () {
    var env = route();
    env.api.remember({ id: 'movie:1' }, 'ts');
    assert.equal(names(env.api.plan({ id: 'movie:1', fileAudio: DTS }, SOURCE, 'file.mkv')), 'ts? m3u8^? file!');
    env.api.remember({ id: 'movie:1' }, 'none');
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
    assert.equal(api.offered({ id: 'movie:1', fileAudio: DTS, sources: [SOURCE] }), true);
    assert.equal(api.offered({ id: 'movie:1', sources: [{ via: 'avplay', url: 'x' }] }), false);
});

test('#92 Converted sound is hidden for playable or unknown sound without evidence of silence', function () {
    var api = route().api;
    [null, [], [{ codec: 'aac' }], DTS.concat([{ codec: 'aac' }])].forEach(function (audio) {
        var request = { id: 'movie:1', fileAudio: audio, sources: [SOURCE] };
        assert.equal(api.offered(request), false);
        assert.equal(api.offered(request, { route: 'file', sound: true }), false);
    });
});

test('#92 Converted sound is offered for an all-DTS file, missing sound or a saved none note', function () {
    var env = route();
    var request = { id: 'movie:1', sources: [SOURCE] };
    assert.equal(env.api.offered(Object.assign({}, request, { fileAudio: DTS })), true);
    assert.equal(env.api.offered(request, { route: 'file', sound: false }), true);
    // A missing AVPlay track is useful evidence even with a playable header.
    assert.equal(env.api.offered(Object.assign({}, request, { fileAudio: [{ codec: 'aac' }] }), { sound: false }), true);
    env.api.remember(request, 'none');
    assert.equal(env.api.offered(request), true);
    assert.equal(env.api.offered(request, { sound: true }), false);
    assert.equal(env.api.offered({ id: 'movie:2', sources: [SOURCE] }), false);
});

test('#92 a playing converted route keeps the way back, but live and files without converted addresses never offer it', function () {
    var api = route().api;
    var request = { id: 'movie:1', sources: [SOURCE] };
    ['m3u8', 'ts'].forEach(function (name) {
        assert.equal(api.offered(request, { route: name, sound: true }), true);
    });
    [null, { sources: [SOURCE] }, { id: 'live:1', live: true, sources: [SOURCE] },
        { id: 'movie:1', sources: [{ via: 'avplay', converted: [] }] },
        { id: 'movie:1', sources: [{ via: 'video', converted: SOURCE.converted }] }].forEach(function (request) {
        assert.equal(api.offered(request, { sound: false }), false);
    });
});

test('#92 retry messages name HLS or TS on success and explain fallback in English and Arabic', function () {
    var env = load(['player-tracks.js', 'audio-route.js', 'i18n/ar.js']);
    var texts = {
        en: ['Playing the provider\'s converted sound (HLS)', 'Playing the provider\'s converted sound (TS)', 'The provider has no other sound for this movie or episode'],
        ar: ['يُشغَّل الآن الصوت المحوَّل من المزوّد (HLS)', 'يُشغَّل الآن الصوت المحوَّل من المزوّد (TS)', 'لا يوفّر المزوّد صوتًا آخر لهذا الفيلم أو الحلقة'],
    };
    Object.keys(texts).forEach(function (language) {
        env.globals.I18n.setLanguage(language);
        ['m3u8', 'ts', 'file'].forEach(function (name, index) {
            assert.equal(env.globals.AudioRoute.result(name), texts[language][index]);
        });
    });
});

test('the message names the format the file holds, or says it plainly', function () {
    var api = route().api;
    assert.match(api.message({ fileAudio: DTS }), /\(DTS\) isn't supported by Samsung TVs/);
    assert.match(api.message({ fileAudio: null }), /isn't supported by this TV/);
});

test('an old "no sound" note does not silence a file whose header names playable sound; forget drops the note', function () {
    var env = route();
    var aac = [{ codec: 'aac', language: 'ara', channels: 2 }];
    env.api.remember({ id: 'movie:1' }, 'none');
    assert.equal(names(env.api.plan({ id: 'movie:1', fileAudio: aac }, SOURCE, 'file.mkv')), 'file');
    assert.equal(names(env.api.plan({ id: 'movie:1', fileAudio: null }, SOURCE, 'file.mkv')), 'file!');
    env.api.forget({ id: 'movie:1' });
    assert.deepEqual(JSON.parse(env.stored['iptvnator-tv:audio-route']), {});
    assert.equal(names(env.api.plan({ id: 'movie:1', fileAudio: null }, SOURCE, 'file.mkv')), 'file~');
});

test('a direct .m3u8 try comes first; an older "file" note is checked again, and m3u8 that worked is tried first', function () {
    var env = route();
    env.api.remember({ id: 'movie:1' }, 'file');
    assert.equal(names(env.api.plan({ id: 'movie:1', fileAudio: DTS }, SOURCE, 'file.mkv')), 'm3u8^? ts? file!');
    env.api.remember({ id: 'movie:1' }, 'm3u8');
    assert.equal(names(env.api.plan({ id: 'movie:1', fileAudio: DTS }, SOURCE, 'file.mkv')), 'm3u8^? ts? file!');
});

test('asking for Converted sound tries the converted addresses even after a saved "own sound" or "no sound" note', function () {
    ['original', 'none'].forEach(function (note) {
        var env = route();
        env.api.remember({ id: 'movie:1' }, note);
        assert.equal(names(env.api.plan({ id: 'movie:1', fileAudio: DTS, audioRetry: true, audioRoute: null }, SOURCE, 'file.mkv')), 'm3u8^? ts? file!');
    });
});

test('notes are kept per source: the same id on another source starts afresh', function () {
    var env = route();
    env.api.remember({ id: 'movie:1', subtitleId: 'a|movie:1' }, 'none');
    assert.equal(names(env.api.plan({ id: 'movie:1', subtitleId: 'a|movie:1', fileAudio: DTS }, SOURCE, 'file.mkv')), 'file!');
    assert.equal(names(env.api.plan({ id: 'movie:1', subtitleId: 'b|movie:1', fileAudio: DTS }, SOURCE, 'file.mkv')), 'm3u8^? ts? file!');
    env.api.forget({ id: 'movie:1', subtitleId: 'a|movie:1' });
    assert.deepEqual(JSON.parse(env.stored['iptvnator-tv:audio-route']), {});
});
