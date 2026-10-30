'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var uiSandbox = require('./ui-sandbox');

function streamInfo(overrides) {
    return load(['stream-info.js'], {}, Object.assign({ UI: uiSandbox.UI }, overrides)).globals.StreamInfo;
}

function avStream(type, extra) {
    return { type: type, index: 0, extra_info: typeof extra === 'string' ? extra : JSON.stringify(extra) };
}

// "Label  value" lines, as the panel shows them.
function lines(StreamInfo, sample) {
    return JSON.parse(JSON.stringify(StreamInfo.rows(StreamInfo.read(sample)).map(function (row) { return row.label + '  ' + row.value; })));
}

test('#84 AVPlay stream info: resolution, frame rate, codecs, bitrate, buffer and the sound route', function () {
    var StreamInfo = streamInfo();
    var sample = {
        engine: 'avplay',
        route: 'file',
        avBuffer: 100,
        streams: [
            avStream('VIDEO', { Width: '1920', Height: '1080', fourCC: 'H264', Bit_rate: '4500000', framerate: '25' }),
            avStream('AUDIO', { language: 'eng', fourCC: 'AAC', channels: '6', bit_rate: '384000' }),
            avStream('TEXT', { language: 'swe' }),
        ],
    };
    assert.deepEqual(lines(StreamInfo, sample), [
        'Resolution  1920×1080',
        'Frame rate  25 fps',
        'Video  H.264',
        'Audio  AAC · 6 ch',
        'Bitrate  4.9 Mbps',
        'Buffer  100 %',
        'Sound  The stream\'s own',
        'Dropped frames  –',
        'Player  Samsung AVPlay',
    ]);
    sample.route = 'm3u8';
    sample.avBuffer = 42.4;
    var converted = lines(StreamInfo, sample);
    assert.equal(converted[5], 'Buffer  42 %');
    assert.equal(converted[6], 'Sound  Converted by the provider (HLS)');
});

test('#84 what AVPlay does not report, or reports unreadably, shows –', function () {
    var StreamInfo = streamInfo();
    assert.deepEqual(lines(StreamInfo, { engine: 'avplay', route: 'file', avBuffer: null, streams: [avStream('VIDEO', 'broken')] }), [
        'Resolution  –', 'Frame rate  –', 'Video  –', 'Audio  –', 'Bitrate  –', 'Buffer  –', 'Sound  The stream\'s own', 'Dropped frames  –', 'Player  Samsung AVPlay',
    ]);
});

test('#84 hls.js and mpegts.js: the level or media info, the buffer ahead and dropped frames from the video element', function () {
    var StreamInfo = streamInfo();
    var video = { width: 1280, height: 720, buffered: 3.25, dropped: 4, frames: 100 };
    assert.deepEqual(lines(StreamInfo, { engine: 'hls', route: 'file', video: video, level: { bitrate: 2500000, frameRate: 29.97, videoCodec: 'avc1.64001f', audioCodec: 'mp4a.40.2' } }), [
        'Resolution  1280×720',
        'Frame rate  29.97 fps',
        'Video  H.264',
        'Audio  AAC',
        'Bitrate  2.5 Mbps',
        'Buffer  3.3 s',
        'Sound  The stream\'s own',
        'Dropped frames  4',
        'Player  hls.js',
    ]);
    var ts = lines(StreamInfo, { engine: 'mpegts', route: 'file', video: { width: 1920, height: 1080, buffered: 0.5, dropped: null },
        media: { fps: 50, videoCodec: 'hvc1.1.6.L120.90', audioCodec: 'ec-3', audioChannelCount: 6, videoDataRate: 7000, audioDataRate: 640 },
        stats: { droppedFrames: 2 } });
    assert.deepEqual(ts.slice(1, 5), ['Frame rate  50 fps', 'Video  HEVC', 'Audio  E-AC-3 · 6 ch', 'Bitrate  7.6 Mbps']);
    assert.equal(ts[7], 'Dropped frames  2');
    assert.equal(ts[8], 'Player  mpegts.js');
});

test('#84 a plain video element knows only its size, buffer and dropped frames', function () {
    var StreamInfo = streamInfo();
    assert.deepEqual(lines(StreamInfo, { engine: 'video', route: 'file', video: { width: 0, height: 0, buffered: null, dropped: 0 } }), [
        'Resolution  –', 'Frame rate  –', 'Video  –', 'Audio  –', 'Bitrate  –', 'Buffer  –', 'Sound  The stream\'s own', 'Dropped frames  0', 'Player  HTML5 video',
    ]);
});

test('#84 the frame rate is measured from decoded frames when the engine does not say', function () {
    var StreamInfo = streamInfo();
    assert.equal(StreamInfo.measuredFps({ frames: 100, at: 1000 }, { frames: 125, at: 2000 }), 25);
    assert.equal(StreamInfo.measuredFps(null, { frames: 125, at: 2000 }), null);
    assert.equal(StreamInfo.measuredFps({ frames: 100, at: 1000 }, { frames: 100, at: 2000 }), null);
    assert.equal(StreamInfo.measuredFps({ frames: 100, at: 1000 }, { frames: 50, at: 2000 }), null);
});

test('#84 codec names are short and readable', function () {
    var StreamInfo = streamInfo();
    assert.equal(StreamInfo.codecName('avc1.640028'), 'H.264');
    assert.equal(StreamInfo.codecName('HEVC'), 'HEVC');
    assert.equal(StreamInfo.codecName('mp4a.40.2'), 'AAC');
    assert.equal(StreamInfo.codecName('mp4a.40.2,avc1.4d401f'), 'AAC');
    assert.equal(StreamInfo.codecName('ac-3'), 'AC-3');
    assert.equal(StreamInfo.codecName('flac'), 'FLAC');
    assert.equal(StreamInfo.codecName(''), null);
});

test('#84 the panel never shows the stream link or the provider host', function () {
    var timers = [];
    var StreamInfo = streamInfo({ setInterval: function (fn, ms) { timers.push({ fn: fn, ms: ms }); return timers.length; }, clearInterval: function () {} });
    var root = { className: 'hidden', classList: { add: function () { root.hidden = true; }, remove: function () { root.hidden = false; } } };
    var link = 'http://provider.example:8080/live/user/secret/1001.ts';
    var panel = StreamInfo.create(root, function () {
        // Everything an engine might hand over, including its address.
        return { engine: 'hls', route: 'file', url: link, video: { width: 1920, height: 1080, buffered: 2, dropped: 0, src: link },
            level: { bitrate: 1000000, url: [link], uri: link, videoCodec: 'avc1', audioCodec: 'mp4a.40.2' } };
    });
    panel.show();
    assert.equal(panel.shown(), true);
    assert.equal(root.hidden, false);
    assert.equal(timers[0].ms, 1000);
    var text = root.children.map(function (node) { return node.textContent; }).join(' ');
    assert.match(text, /Stream info/);
    assert.match(text, /1920×1080/);
    assert.doesNotMatch(text, /provider\.example|http|secret|1001\.ts/);
    panel.toggle();
    assert.equal(panel.shown(), false);
    assert.equal(root.hidden, true);
});
