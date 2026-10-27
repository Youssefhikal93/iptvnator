'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

var rank = load(['subtitle-rank.js']).globals.SubtitleRank;
var VIDEO = { width: 1920, height: 1080, codec_name: 'h264', r_frame_rate: '24000/1001' };

function match(id, extra) {
    return Object.assign({ file_id: id, language: 'en', release: 'Plain.Release', downloads: 0, hearing: false, fps: 0, hashMatch: false, trusted: false, machine: false }, extra);
}

function order(ranked) {
    return ranked.map(function (entry) { return entry.file_id; }).join(',');
}

test('facts reads resolution, codec family and fractional frame rate, ignoring missing or empty video info', function () {
    var facts = rank.facts(VIDEO);
    assert.equal(facts.resolution, '1080p');
    assert.equal(facts.codec, 'x264');
    assert.ok(Math.abs(facts.fps - 23.976) < 0.001);
    assert.equal(rank.facts({ width: 1920, height: 800, codec_name: 'hevc', avg_frame_rate: '25' }).resolution, '1080p');
    assert.equal(rank.facts({ height: 2160, codec_name: 'HEVC' }).codec, 'x265');
    assert.equal(rank.facts({ height: 720 }).resolution, '720p');
    assert.equal(rank.facts({ height: 480 }).resolution, '480p');
    ['', null, undefined, [], {}, { r_frame_rate: '0/0', width: 'x' }].forEach(function (empty) {
        var none = rank.facts(empty);
        assert.equal(none.resolution + none.codec + none.fps, '0');
    });
});

test('a movie-hash match outranks every other signal', function () {
    var ranked = rank.rank([
        match(1, { fps: 23.976, release: 'Film.1080p.x264', downloads: 90000, trusted: true }),
        match(2, { hashMatch: true, release: 'Unrelated', downloads: 1 }),
    ], VIDEO);
    assert.equal(order(ranked), '2,1');
    assert.equal(ranked[0].marks.join('|'), 'hash ✓');
    assert.equal(ranked[0].recommended, true);
    assert.equal(ranked[1].recommended, false);
});

test('matching fps outranks release tokens, which outrank downloads and trust', function () {
    var ranked = rank.rank([
        match(1, { downloads: 500000, trusted: true }),
        match(2, { release: 'Film.1080p.WEBRip.x264', downloads: 5 }),
        match(3, { fps: 23.976, downloads: 1 }),
    ], VIDEO);
    assert.equal(order(ranked), '3,2,1');
    assert.equal(ranked[0].marks.join('|'), '23.976 fps ✓');
    assert.equal(ranked[1].marks.join('|'), '1080p ✓|x264 ✓');
});

test('fps within 0.01 counts as equal, so 23.976 and 23.98 match but 24 and 25 do not', function () {
    var ranked = rank.rank([match(1, { fps: 24 }), match(2, { fps: 23.98 }), match(3, { fps: 25 })], VIDEO);
    assert.equal(order(ranked), '2,1,3');
    assert.equal(ranked[0].marks.join('|'), '23.98 fps ✓');
    assert.equal(ranked[1].marks.length, 0);
});

test('release tokens need whole words and the video resolution and codec family', function () {
    var ranked = rank.rank([
        match(1, { release: 'Film.720p.x264' }),
        match(2, { release: 'Film.1080p.x265' }),
        match(3, { release: 'Film.BluRay.1080p.H.264-GRP' }),
        match(4, { release: 'Film x2641080p9' }),
    ], VIDEO);
    assert.equal(order(ranked), '3,2,1,4');
    assert.equal(ranked[0].marks.join('|'), '1080p ✓|x264 ✓');
    var hevc = rank.rank([match(1, { release: 'Film.x264' }), match(2, { release: 'Film.HEVC' })], { height: 1080, codec_name: 'hevc' });
    assert.equal(order(hevc), '2,1');
});

test('more downloads and trusted uploaders break ties; the original order breaks the rest', function () {
    var ranked = rank.rank([match(1, { downloads: 10 }), match(2, { downloads: 48213 }), match(3, { downloads: 10, trusted: true }), match(4, { downloads: 10 })], {});
    assert.equal(order(ranked), '3,2,1,4');
    assert.equal(order(rank.rank([match(1), match(2), match(3)], undefined)), '1,2,3');
});

test('machine or AI translations sort last but stay listed, and are never the recommendation', function () {
    var ranked = rank.rank([
        match(1, { machine: true, hashMatch: true, downloads: 900000 }),
        match(2, { downloads: 1 }),
        match(3, { machine: true }),
    ], VIDEO);
    assert.equal(order(ranked), '2,1,3');
    assert.equal(ranked[0].recommended, true);
    var only = rank.rank([match(1, { machine: true })], VIDEO);
    assert.equal(only.length, 1);
    assert.equal(only[0].recommended, false);
});

test('ranking returns copies and handles an empty list', function () {
    var input = [match(1), match(2, { downloads: 9 })];
    var ranked = rank.rank(input, VIDEO);
    assert.equal(order(input), '1,2');
    assert.equal(input[0].marks, undefined);
    assert.equal(ranked.length, 2);
    assert.equal(rank.rank([], VIDEO).length, 0);
    assert.equal(rank.rank(null, VIDEO).length, 0);
});

test('count adds thousand separators', function () {
    assert.equal(rank.count(48213), '48,213');
    assert.equal(rank.count(0), '0');
    assert.equal(rank.count(999), '999');
    assert.equal(rank.count(1234567), '1,234,567');
    assert.equal(rank.count(undefined), '0');
});
