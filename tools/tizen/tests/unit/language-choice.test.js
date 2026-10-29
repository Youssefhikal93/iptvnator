'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

function scene(sound, language, when) {
    var calls = [];
    var env = load(['settings-store.js', 'audio-choice.js', 'language-choice.js', 'player-tracks.js'], {}, {
        fetch: function () { throw new Error('Automatic subtitle network request'); },
        OpenSubs: { search: forbidden, download: forbidden },
        SubDL: { search: forbidden, download: forbidden },
    }).globals;
    function forbidden() { assert.fail('Subtitle providers must remain manual'); }
    env.Prefs.set('preferredSound', sound);
    env.Prefs.set('preferredSubtitles', { language: language, when: when || 'always' });
    function bind(rows, type) {
        return rows.map(function (row) {
            row.select = function () { calls.push(type + ':' + row.ref); };
            return row;
        });
    }
    var tracks = env.PlayerTracks.hls({
        audioTracks: [{ lang: 'ara' }, { lang: 'eng' }], audioTrack: 0,
        subtitleTracks: [{ lang: 'en-GB' }], subtitleTrack: -1,
    });
    tracks.audio = bind(tracks.audio, 'audio');
    tracks.text = bind(tracks.text, 'text');
    return { env: env, calls: calls, tracks: tracks, apply: function (request) {
        env.LanguageChoice.apply(request || {}, tracks, env.LanguageChoice.read());
    } };
}

test('#60 show pick wins, preference overrides last, and missing preference keeps the file default', function () {
    var s = scene('en', '', 'always');
    var episode = { episodes: { show: 's1|show' } };
    s.env.AudioChoice.remember(episode, 'ar');
    s.env.AudioChoice.remember({}, 'ar');
    s.apply(episode);
    assert.deepEqual(s.calls, []);
    s.apply({ episodes: { show: 's1|other' } });
    assert.deepEqual(s.calls, ['audio:1']);
    s.calls.length = 0;
    s.env.Prefs.set('preferredSound', 'de');
    s.env.AudioChoice.remember({}, 'en');
    s.apply();
    assert.deepEqual(s.calls, []);
    s.env.Prefs.set('preferredSound', '');
    s.apply();
    assert.deepEqual(s.calls, ['audio:1']);
});

test('#60 Off, unavailable subtitles and understood sound stay off; unknown sound is not understood', function () {
    [
        ['', '', 'always', 'ara', []],
        ['', 'de', 'always', 'ara', []],
        ['', 'en', 'always', 'ara', ['text:0']],
        ['', 'en', 'only', 'eng', []],
        ['ar', 'en', 'only', 'ara', []],
        ['', 'en', 'only', 'ara', ['text:0']],
        ['', 'en', 'only', '', ['text:0']],
    ].forEach(function (c) {
        var s = scene(c[0], c[1], c[2]);
        s.tracks.audio[0].language = c[3];
        s.apply();
        assert.deepEqual(s.calls, c[4], JSON.stringify(c));
    });
});

test('#60 subtitle condition uses the selected sound; live TV ignores both preferences', function () {
    var s = scene('en', 'en', 'only');
    s.apply();
    assert.deepEqual(s.calls, ['audio:1']);
    s.calls.length = 0;
    s.apply({ live: true });
    assert.deepEqual(s.calls, []);
});

test('#60 native and AVPlay subtitle metadata survives, and Off leaves a showing subtitle on', function () {
    var s = scene('', '', 'always');
    var nativeTrack = { kind: 'subtitles', language: 'en-GB', mode: 'showing' };
    var native = s.env.PlayerTracks.native([], [nativeTrack]);
    assert.equal(native.text[1].language, 'en-GB');
    var av = s.env.PlayerTracks.av([{ type: 'TEXT', index: 3, extra_info: '{"language":"eng"}' }], -1, 3);
    assert.equal(av.text[1].language, 'eng');
    s.tracks.text[0].active = false;
    s.tracks.text[1].active = true;
    // Off never switches anything: a subtitle downloaded for the title stays.
    s.apply();
    assert.deepEqual(s.calls, []);
});

test('#60 a refused sound switch is not done, so the player tries again later', function () {
    var s = scene('en', '', 'always');
    s.tracks.audio[1].select = function () { throw new Error('InvalidStateError'); };
    var env = s.env;
    env.Log = { error: function () {}, info: function () {} };
    assert.equal(env.LanguageChoice.apply({}, s.tracks, env.LanguageChoice.read()), false);
    s.tracks.audio[1].select = function () { s.calls.push('audio:ok'); };
    assert.equal(env.LanguageChoice.apply({}, s.tracks, env.LanguageChoice.read()), true);
    assert.deepEqual(s.calls, ['audio:ok']);
});
