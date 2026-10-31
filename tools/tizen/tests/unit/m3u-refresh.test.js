'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

// An M3U adapter whose download answers with the playlist text given.
function adapter(text) {
    var env = load(['m3u-vod.js', 'm3u.js'], {}, {
        SourceRequest: function () { return Promise.resolve(text); },
    });
    return env.globals.M3uSource({ id: 's3', type: 'm3u', url: 'http://h/list.m3u' });
}

var OLD = '#EXTM3U\n#EXTINF:-1 group-title="News",One\nhttp://h/1.ts\n';
var NEW = '#EXTM3U\n#EXTINF:-1 group-title="News",One\nhttp://h/1.ts\n#EXTINF:-1 group-title="Sport",Two\nhttp://h/2.ts\n';

test('the open M3U adapter adopts a background refresh\'s playlist, so its categories are the new ones', async function () {
    var open = adapter(OLD);
    var before = await open.categories('live');
    assert.equal(before.map(function (row) { return row.category_name; }).join(','), 'All channels,News');
    var refreshed = adapter(NEW);
    await refreshed.account();
    open.adopt(refreshed.playlist());
    var after = await open.categories('live');
    assert.ok(after.some(function (row) { return row.category_name === 'Sport'; }), 'the new group is listed');
    var sport = after.filter(function (row) { return row.category_name === 'Sport'; })[0];
    var items = await open.items('live', sport.category_id);
    assert.equal(items.map(function (item) { return item.name; }).join(','), 'Two');
});

test('adopting nothing keeps the playlist already parsed', async function () {
    var open = adapter(OLD);
    await open.account();
    open.adopt(null);
    assert.ok(open.playlist());
});