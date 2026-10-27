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

test('AVPlay stream info lists video and audio details, skipping unreadable entries', function () {
    var lines = tracks.infoLines({
        engine: 'avplay',
        streams: [
            avTrack('VIDEO', 0, { Width: 1920, Height: 1080, fourcc: 'H264', bit_rate: 4500000 }),
            avTrack('AUDIO', 1, { language: 'eng', codec: 'AAC', channels: 6, sample_rate: 48000, bitrate: 384000 }),
            avTrack('AUDIO', 2, 'broken'),
            avTrack('TEXT', 3, { language: 'swe' }),
        ],
    });
    same(lines, [
        'Video  1920×1080 · H264 · 4.5 Mbps',
        'Audio  English · AAC · 6 ch · 48000 Hz · 384 kbps',
        'Player  Samsung AVPlay',
    ]);
});

test('AVPlay stream info with nothing readable still names the player', function () {
    same(tracks.infoLines({ engine: 'avplay', streams: [] }), ['Player  Samsung AVPlay']);
});

test('hls.js info shows the picture size and the level bitrate; others only the size', function () {
    same(tracks.infoLines({ engine: 'hls', width: 1280, height: 720, level: { bitrate: 2500000 } }), [
        'Video  1280×720',
        'Bitrate  2.5 Mbps',
        'Player  hls.js',
    ]);
    same(tracks.infoLines({ engine: 'hls', width: 0, level: null }), ['Player  hls.js']);
    same(tracks.infoLines({ engine: 'mpegts', width: 640, height: 360, level: { bitrate: 1 } }), [
        'Video  640×360',
        'Player  mpegts.js',
    ]);
    same(tracks.infoLines({ engine: 'video', width: 0 }), ['Player  HTML5 video']);
});

test('a level without a bitrate keeps an empty Bitrate line', function () {
    var lines = tracks.infoLines({ engine: 'hls', width: 0, level: {} });
    assert.equal(lines[0], 'Bitrate  ');
});
