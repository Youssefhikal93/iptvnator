'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var now = Date.parse('2026-11-03T14:25:43Z');
var clock = class extends Date { static now() { return now; } };
var api = load(['xtream.js', 'catch-up.js'], {}, { Date: clock, Log: { setSecrets: function () {} } }).globals;
var channel = { stream_id: 1001, name: 'News', tv_archive: 1, tv_archive_duration: 3 };
var account = { type: 'xtream', url: 'http://localhost:8263', user: 'tester', pass: 'secret', server_info: { timezone: 'Europe/Stockholm' } };

test('#97 pause and rewind use whole provider minutes, clamped inside retention and live', function () {
    [
        [now, now - 43000, '2026-11-03:15-25', 1],
        [now - 163000, now - 163000, '2026-11-03:15-23', 3],
        [now - 4 * 86400000, now - 3 * 86400000 + 17000, '2026-10-31:15-26', 4320],
        [now + 60000, now - 43000, '2026-11-03:15-25', 1],
    ].forEach(function (entry) {
        var req = api.CatchUp.liveRequest(channel, entry[0], account);
        assert.equal(req.catchUp.start, entry[1]);
        assert.ok(req.sources[0].url.endsWith('/' + entry[3] + '/' + entry[2] + '/1001.ts'));
        assert.equal(req.id, undefined);
        assert.equal(req.liveTimeshift, true);
    });
});

test('#97 unknown retention, non-archive, M3U and invalid cursor never open timeshift', function () {
    [0, undefined, 'unknown'].forEach(function (duration) {
        assert.equal(api.CatchUp.liveRequest(Object.assign({}, channel, { tv_archive_duration: duration }), now, account), null);
    });
    assert.equal(api.CatchUp.liveRequest(Object.assign({}, channel, { tv_archive: 0 }), now, account), null);
    assert.equal(api.CatchUp.liveRequest(channel, NaN, account), null);
    assert.equal(api.CatchUp.liveRequest(channel, now, Object.assign({}, account, { type: 'm3u' })), null);
});
