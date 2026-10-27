'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var subtitles = load(['subtitle-file.js']).globals.SubtitleFile;

test('SRT accepts BOM, CRLF, decimal variants and strips formatting while retaining line breaks', function () {
    var cues = subtitles.parse('\uFEFF1\r\n00:00:01,250 --> 00:00:03.5\r\n{\\an8}<i>Hello</i> &amp; welcome\r\nSecond line\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,000\r\n<b>Bye</b>');
    assert.equal(cues.length, 2);
    assert.equal(cues[0].start, 1250);
    assert.equal(cues[0].end, 3500);
    assert.equal(cues[0].text, 'Hello & welcome\nSecond line');
    assert.equal(cues[1].text, 'Bye');
});

test('VTT skips header, notes and styles, accepts cue ids and timing settings, and sorts cues', function () {
    var cues = subtitles.parse('WEBVTT\nKind: captions\n\nNOTE ignored\n00:00.000 --> 00:10.000\nnot a cue\n\nSTYLE\n::cue { color: red; }\n\nsecond\n00:04.000 --> 00:05.000 align:start\n<v Speaker>Later</v>\n\n00:00:01.000 --> 00:00:03.000 line:90%\n<c.yellow>First</c>');
    assert.equal(cues.length, 2);
    assert.equal(cues.map(function (cue) { return cue.text; }).join(','), 'First,Later');
    assert.equal(cues[0].start, 1000);
});

test('malformed, empty and reversed cues never render', function () {
    ['', 'not subtitles', '1\n00:01:00,000 --> 00:00:02,000\nBad',
        '1\n00:99:00,000 --> 01:00:00,000\nBad', '1\n00:00:01,000 --> 00:00:02,000\n<i></i>'].forEach(function (text) {
        assert.equal(subtitles.parse(text).length, 0);
    });
});

test('cue lookup uses exclusive ends, overlapping cues, positive delay and negative advance, including seeks', function () {
    var cues = subtitles.parse('1\n00:00:01,000 --> 00:00:03,000\nOne\n\n2\n00:00:02,000 --> 00:00:04,000\nTwo');
    [[999, 0, ''], [1000, 0, 'One'], [2000, 0, 'One\nTwo'], [3000, 0, 'Two'],
        [4000, 0, ''], [1200, 500, ''], [1500, 500, 'One'], [500, -500, 'One'],
        [999, 0, '']].forEach(function (row) { assert.equal(subtitles.at(cues, row[0], row[1]), row[2]); });
});
