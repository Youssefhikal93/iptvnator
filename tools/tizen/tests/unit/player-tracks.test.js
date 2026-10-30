'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

var tracks = load(['player-tracks.js']).globals.PlayerTracks;

// The module runs in a vm context, whose arrays are not this realm's.
function same(actual, expected) {
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
}

function pickFields(list) {
    return list.map(function (t) { return t.label + '|' + t.active + '|' + t.ref; });
}

function avTrack(type, index, extra) {
    return { type: type, index: index, extra_info: typeof extra === 'string' ? extra : JSON.stringify(extra) };
}

test('AVPlay tracks: language names, fallback labels and a leading Off entry', function () {
    var total = [
        avTrack('VIDEO', 0, {}),
        avTrack('AUDIO', 1, { language: 'eng' }),
        avTrack('AUDIO', 2, 'not json'),
        avTrack('TEXT', 3, { language: 'swe' }),
        avTrack('TEXT', 4, {}),
    ];
    var out = tracks.av(total, 2, -1);
    same(pickFields(out.audio), ['English|false|1', 'Track 2|true|2']);
    same(pickFields(out.text), ['Off|true|-1', 'Swedish|false|3', 'Track 2|false|4']);
});

test('AVPlay: a selected subtitle turns Off inactive; no tracks gives only Off', function () {
    var total = [avTrack('TEXT', 5, { language: 'de' })];
    same(pickFields(tracks.av(total, -1, 5).text), ['Off|false|-1', 'German|true|5']);
    var empty = tracks.av(undefined, -1, -1);
    same(empty.audio, []);
    same(pickFields(empty.text), ['Off|true|-1']);
});

// What MediaSniff read from a file: Arabic AAC 2.0, English AC-3 5.1, English DTS 5.1.
var FILE = [
    { codec: 'aac', language: 'ara', channels: 2 },
    { codec: 'ac3', language: 'eng', channels: 6 },
    { codec: 'dts', language: 'eng', channels: 6 },
];

function rows(list) {
    return list.map(function (t) { return t.label + '|' + t.active + '|' + t.ref + (t.unsupported ? '|unsupported' : ''); });
}

test('the file\'s tracks name AVPlay\'s, and a DTS track AVPlay hides is listed as unsupported', function () {
    var total = [avTrack('VIDEO', 0, {}), avTrack('AUDIO', 1, {}), avTrack('AUDIO', 2, {})];
    same(rows(tracks.av(total, 2, -1, FILE).audio), [
        'Arabic · AAC 2.0|false|1',
        'English · AC-3 5.1|true|2',
        'English · DTS 5.1|false|null|unsupported',
    ]);
    same(tracks.av(total, 2, -1, FILE).audio.map(function (t) { return t.language; }), ['ara', 'eng', 'eng']);
});

test('a DTS-only file shows its one track as unsupported instead of nothing', function () {
    same(rows(tracks.av([avTrack('VIDEO', 0, {})], -1, -1, [{ codec: 'dts', language: 'eng', channels: 6 }]).audio), [
        'English · DTS 5.1|false|null|unsupported',
    ]);
});

test('a TV that lists the DTS track too plays every track, and a list that does not line up keeps AVPlay\'s', function () {
    var three = [avTrack('AUDIO', 1, {}), avTrack('AUDIO', 2, {}), avTrack('AUDIO', 3, {})];
    same(rows(tracks.av(three, 3, -1, FILE).audio), ['Arabic · AAC 2.0|false|1', 'English · AC-3 5.1|false|2', 'English · DTS 5.1|true|3']);
    var one = [avTrack('AUDIO', 1, { language: 'ara' })];
    same(rows(tracks.av(one, 1, -1, FILE).audio), ['Arabic|true|1']);
    same(rows(tracks.av(one, 1, -1, null).audio), ['Arabic|true|1']);
    same(rows(tracks.av([avTrack('AUDIO', 1, {})], 1, -1, [{ codec: 'opus', language: '', channels: 3 }]).audio), ['Track 1 · Opus 3 ch|true|1']);
});

test('AVPlay current index reads the stream of one type, else -1', function () {
    var streams = [{ type: 'VIDEO', index: 0 }, { type: 'AUDIO', index: 7 }];
    assert.equal(tracks.avCurrentIndex(streams, 'AUDIO'), 7);
    assert.equal(tracks.avCurrentIndex(streams, 'TEXT'), -1);
    assert.equal(tracks.avCurrentIndex(null, 'AUDIO'), -1);
});

test('hls.js tracks: names, languages, fallbacks and Off first', function () {
    var out = tracks.hls({
        audioTracks: [{ name: 'Main' }, { lang: 'fr' }, {}],
        audioTrack: 1,
        subtitleTracks: [{ lang: 'sv' }, {}],
        subtitleTrack: 1,
    });
    same(pickFields(out.audio), ['Main|false|0', 'French|true|1', 'Track 3|false|2']);
    same(pickFields(out.text), ['Off|false|-1', 'Swedish|false|0', 'Subtitle 2|true|1']);
    var none = tracks.hls({ subtitleTrack: -1 });
    same(none.audio, []);
    same(pickFields(none.text), ['Off|true|-1']);
});

test('video element tracks: audio by enabled, Off only beside a subtitle track', function () {
    var audio = [{ label: 'Stereo', enabled: false }, { language: 'en', enabled: true }];
    var subs = [
        { kind: 'metadata', label: 'cues', mode: 'disabled' },
        { kind: 'subtitles', language: 'es', mode: 'showing' },
        { kind: 'captions', mode: 'disabled' },
    ];
    var out = tracks.native(audio, subs);
    same(out.audio.map(function (t) { return t.label + '|' + t.active; }), ['Stereo|false', 'English|true']);
    same(out.text.map(function (t) { return t.label + '|' + t.active; }), ['Off|false', 'Spanish|true', 'Subtitle 2|false']);
    assert.equal(out.text[0].ref, null);
    assert.equal(out.text[1].ref, subs[1], 'a text entry points back at its track');
    assert.equal(out.audio[1].ref, audio[1]);

    subs[1].mode = 'disabled';
    assert.equal(tracks.native(audio, subs).text[0].active, true);

    var plain = tracks.native(undefined, [{ kind: 'metadata' }]);
    same(plain, { audio: [], text: [] });
    same(tracks.nativeSubtitles(subs).length, 2);
});
