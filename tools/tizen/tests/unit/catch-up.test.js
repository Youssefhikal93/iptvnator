'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var globals = load(['xtream.js', 'catch-up.js', 'guide-time.js'], {}, { Log: { setSecrets: function () {} } }).globals;
var catchUp = globals.CatchUp;
var channel = { stream_id: 1001, name: 'News', tv_archive: '1', tv_archive_duration: '3' };
var account = { type: 'xtream', url: ' https://example.test/ ', user: ' user / ', pass: ' p?ss ' };

test('only Xtream archive channels with a positive retention offer catch-up', function () {
    assert.equal(catchUp.available(channel), true);
    [null, {}, { tv_archive: 1, tv_archive_duration: 3 },
        Object.assign({}, channel, { url: 'https://example.test/live' }),
        Object.assign({}, channel, { tv_archive: 0 }),
        Object.assign({}, channel, { tv_archive_duration: 0 }),
        Object.assign({}, channel, { tv_archive_duration: 'invalid' }),
        Object.assign({}, channel, { tv_archive_duration: Infinity })].forEach(function (entry) {
        assert.equal(catchUp.available(entry), false);
    });
    assert.equal(catchUp.days(channel), 3);
});

test('timeshift requests encode credentials, round duration up and use the provider clock across DST', function () {
    [
        ['2024-01-02T23:04:00Z', 'Europe/Stockholm', '2024-01-03:00-04'],
        ['2024-07-02T23:04:00Z', 'Europe/Stockholm', '2024-07-03:01-04'],
        ['2024-01-02T23:04:00Z', 'America/New_York', '2024-01-02:18-04'],
    ].forEach(function (entry) {
        var start = Date.parse(entry[0]);
        var programme = { start: start, end: start + 3600001, title: 'Evening' };
        // The historical timestamp must still be inside this test's archive window.
        var archive = Object.assign({}, channel, { tv_archive_duration: 10000 });
        var req = catchUp.request(archive, programme, Object.assign({}, account, { server_info: { timezone: entry[1] } }));
        assert.equal(req.sources[0].url, 'https://example.test/timeshift/user%20%2F/p%3Fss/61/' + entry[2] + '/1001.ts');
        assert.equal(req.sources.map(function (source) { return source.via; }).join(','), 'mpegts,hls,avplay');
        assert.equal(req.title, 'News \u00b7 Evening');
        assert.equal(req.live, false);
        assert.equal(req.id, undefined);
    });
});

test('missing or invalid provider zone uses the TV local clock', function () {
    var start = new Date(2024, 0, 3, 4, 5).getTime();
    var programme = { start: start, end: start + 60000, title: 'Local' };
    var archive = Object.assign({}, channel, { tv_archive_duration: 10000 });
    [undefined, { timezone: 'Invalid/Zone' }].forEach(function (server) {
        var req = catchUp.request(archive, programme, Object.assign({}, account, { server_info: server }));
        assert.match(req.sources[0].url, /\/1\/2024-01-03:04-05\/1001\.ts$/);
    });
});

test('future, expired, invalid and M3U requests do not play; a current programme can restart', function () {
    var now = Date.now();
    [
        { start: now + 60000, end: now + 120000 },
        { start: now - 4 * 86400000, end: now - 3 * 86400000 },
        { start: now - 60000, end: now - 60000 },
        { start: NaN, end: now },
    ].forEach(function (programme) { assert.equal(catchUp.request(channel, programme, account), null); });
    var current = { start: now - 60000, end: now + 60000, title: 'Current' };
    assert.equal(catchUp.request(channel, current, Object.assign({}, account, { type: 'm3u' })), null);
    assert.match(catchUp.request(channel, current, account).sources[0].url, /\/2\//);
});

test('guide retention extends per channel, caps at seven days and keeps non-archive limits', function () {
    var now = Date.now();
    [[channel, 3 * 86400000], [Object.assign({}, channel, { tv_archive_duration: 20 }), 7 * 86400000],
        [{ stream_id: 2 }, 2 * 3600000]].forEach(function (entry) {
        assert.equal(globals.GuideTime.limits(now, entry[0]).from, now - entry[1]);
        assert.equal(globals.GuideTime.clamp(0, now, entry[0]), now - entry[1]);
    });
});

test('account timezone survives the API adapter and archive schedules retain older programmes', async function () {
    var now = Date.now();
    var api = load(['source-account.js', 'xtream.js', 'catch-up.js'], {}, {
        Log: { setSecrets: function () {} }, atob: atob, TextDecoder: TextDecoder,
        SourceRequest: function (url) {
            if (!new URL(url).searchParams.has('action')) return Promise.resolve({
                user_info: { auth: 1, status: 'Active' }, server_info: { timezone: 'UTC' },
            });
            return Promise.resolve({ epg_listings: [4, 2, 1].map(function (days) {
                return { title: btoa('Day ' + days), start_timestamp: String(Math.floor((now - days * 86400000) / 1000)),
                    stop_timestamp: String(Math.floor((now - days * 86400000 + 3600000) / 1000)) };
            }) });
        },
    }).globals;
    var source = api.XtreamSource(account);
    var info = await source.account();
    var programmes = await source.schedule(channel);
    assert.equal(programmes.map(function (programme) { return programme.title; }).join(','), 'Day 2,Day 1');
    assert.equal(await source.schedule({ stream_id: 1003 }), null);
    var programme = programmes[0];
    var req = api.CatchUp.request(channel, programme, Object.assign({}, account, { server_info: info.server_info }));
    var stamp = new Date(programme.start).toISOString().slice(0, 16).replace('T', ':').replace(/:(\d\d)$/, '-$1');
    assert.ok(req.sources[0].url.endsWith('/60/' + stamp + '/1001.ts'));
});
