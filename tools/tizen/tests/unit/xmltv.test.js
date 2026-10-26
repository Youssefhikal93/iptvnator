'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var zlib = require('node:zlib');
var load = require('./sandbox');
var parser = load(['xmltv-parser.js'], {}, {
    ReadableStream: ReadableStream,
    DecompressionStream: DecompressionStream,
    TextDecoderStream: TextDecoderStream,
}).globals.XmltvParser;
var now = Date.UTC(2026, 9, 26, 14);

function stamp(ms) {
    return new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000';
}

function programme(start, end, title) {
    return '<programme channel="c1" start="' + stamp(start) + '" stop="' + stamp(end) + '"><title>' + title + '</title><desc>News &amp; weather</desc></programme>';
}

function parse(xml, size) {
    var records = [];
    var scanner = parser.create({ now: now, offset: 0, emit: function (kind, record) { records.push({ kind: kind, record: record }); } });
    for (var i = 0; i < xml.length; i += size) scanner.write(xml.slice(i, i + size));
    scanner.end();
    return JSON.parse(JSON.stringify(records));
}

test('XMLTV fields and entities survive tags split at every byte boundary', function () {
    var xml = '<?xml version="1.0"?><tv><!-- ignored > --><channel id="c1"><display-name>Å &amp; B &#x1f4fa;</display-name></channel>' + programme(now, now + 3600000, 'A &lt; B &#38; C') + '</tv>';
    [1, 2, 7, 31, xml.length].forEach(function (size) {
        var records = parse(xml, size);
        assert.deepEqual(records[0], { kind: 'channel', record: { id: 'c1', names: ['Å & B 📺'] } });
        assert.deepEqual(records[1].record, { channel: 'c1', start: now, end: now + 3600000, title: 'A < B & C', desc: 'News & weather' });
    });
    var cdata = '<tv><channel id="c1"><display-name><![CDATA[A &amp; <B>]]></display-name></channel></tv>';
    assert.equal(parse(cdata, 1)[0].record.names[0], 'A &amp; <B>');
});

test('XMLTV timezone and viewer offset both shift absolute programme times', function () {
    [
        ['20261026140000 +0100', 0, Date.UTC(2026, 9, 26, 13)],
        ['20261026140000 -0230', 2, Date.UTC(2026, 9, 26, 18, 30)],
        ['20261026140000 +0000', -12, Date.UTC(2026, 9, 26, 2)],
        ['20261026140000 Z', 12, Date.UTC(2026, 9, 27, 2)],
    ].forEach(function (row) { assert.equal(parser.time(row[0], row[1]), row[2]); });
    assert.ok(Number.isNaN(parser.time('not a time', 0)));
});

test('XMLTV retains only programmes overlapping the three-hour/two-day window', function () {
    var from = now - 3 * 3600000;
    var to = now + 2 * 86400000;
    var xml = '<tv>' + programme(from - 3600000, from, 'too old') + programme(from - 3600000, from + 1000, 'overlaps past') + programme(to - 1000, to + 3600000, 'overlaps future') + programme(to, to + 3600000, 'too new') + programme(now, now, 'zero duration') + '</tv>';
    assert.deepEqual(parse(xml, 13).map(function (row) { return row.record.title; }), ['overlaps past', 'overlaps future']);
});

test('truncated and malformed XMLTV cannot replace a saved guide', function () {
    ['<tv><channel id="x">', '<tv><channel></tv>', '<html></html>', '<tv></tv>garbage'].forEach(function (xml) {
        assert.throws(function () { parse(xml, 3); });
    });
});

test('gzip is sniffed across a one-byte first chunk and plain decoded HTTP bodies stay plain', async function () {
    var xml = '<tv><channel id="c1"><display-name>Nyheter på TV</display-name></channel></tv>';
    for (var bytes of [Buffer.from(xml), zlib.gzipSync(xml)]) {
        var body = new ReadableStream({ start: function (controller) {
            for (var i = 0; i < bytes.length; i++) controller.enqueue(bytes.subarray(i, i + 1));
            controller.close();
        } });
        var reader = (await parser.textStream(body)).getReader();
        var result = '';
        for (;;) {
            var part = await reader.read();
            if (part.done) break;
            result += part.value;
        }
        assert.equal(result, xml);
    }
});

test('matching prefers case-insensitive ids, then normalises names and quality tags', function () {
    var index = { ids: { c1: 'c1', c2: 'c2' }, names: { nyheterpåtv: 'c2' } };
    [
        [{ epg_channel_id: 'C1', name: 'Nyheter på TV HD' }, 'c1'],
        [{ tvg_id: 'C1' }, 'c1'],
        [{ epg_channel_id: 'unknown', name: 'Nyheter-på TV (FHD) 4K SD' }, 'c2'],
        [{ name: 'missing' }, null],
        [{}, null],
    ].forEach(function (row) { assert.equal(parser.match(row[0], index), row[1]); });
});

test('M3U tvg-id survives import without changing channel names or groups', async function () {
    var source = load(['m3u-vod.js', 'm3u.js'], {}, { SourceRequest: function () {
        return Promise.resolve('#EXTM3U\n#EXTINF:-1 tvg-id="m3u1.se" group-title="Sports, HD",My channel\nhttp://tv/live.ts');
    } }).globals.M3uSource({ url: 'http://tv/playlist.m3u' });
    var channels = await source.items('live', '');
    assert.equal(channels[0].tvg_id, 'm3u1.se');
    assert.equal(channels[0].name, 'My channel');
    assert.equal(channels[0].group, 'Sports, HD');
});
