'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

var AutoRefresh = load(['auto-refresh.js']).globals.AutoRefresh;
var HOUR = 3600000;
// Local times, as the night starts at 02:00 on the TV's own clock.
var at = function (day, hour, minute) { return new Date(2026, 2, day, hour, minute || 0).getTime(); };

function ask(over) {
    return AutoRefresh.plan(Object.assign({ now: at(4, 10), mode: 'night', busy: false, idleMs: 120000, items: [] }, over));
}

test('Off never refreshes, however old the sources are', function () {
    var items = [{ last: 0, tried: 0 }];
    assert.equal(ask({ mode: 'off', items: items }), null);
    assert.equal(ask({ mode: 'night', items: items }), items[0]);
});

test('nothing refreshes while something plays or before a minute without a key', function () {
    var items = [{ last: 0, tried: 0 }];
    assert.equal(ask({ busy: true, items: items }), null);
    assert.equal(ask({ idleMs: 59999, items: items }), null);
    assert.equal(ask({ idleMs: 60000, items: items }), items[0]);
});

test('daily at night: a night begins at 02:00 and a source refreshed since then waits for the next one', function () {
    var item = { last: at(3, 3), tried: 0 };
    // Refreshed last night at 03:00: tonight's has not begun at 01:59, and has at 02:00.
    assert.equal(ask({ now: at(4, 1, 59), items: [item] }), null);
    assert.equal(ask({ now: at(4, 2), items: [item] }), item);
    // Refreshed tonight: not again that day.
    var done = { last: at(4, 2, 30), tried: 0 };
    assert.equal(ask({ now: at(4, 10), items: [done] }), null);
    assert.equal(ask({ now: at(4, 23, 59), items: [done] }), null);
    assert.equal(ask({ now: at(5, 2), items: [done] }), done);
});

test('daily at night: a missed night is made up once, at the next start', function () {
    var item = { last: at(2, 3), tried: 0 };
    assert.equal(ask({ now: at(4, 19), items: [item] }), item);
    // After that refresh nothing is due until the next night.
    assert.equal(ask({ now: at(4, 19, 5), items: [{ last: at(4, 19, 1), tried: 0 }] }), null);
});

test('daily at night: a refresh a few hours ago is not repeated when the night begins', function () {
    var late = { last: at(3, 23), tried: 0 };
    assert.equal(ask({ now: at(4, 2, 30), items: [late] }), null);
    assert.equal(ask({ now: at(4, 5), items: [late] }), late);
});

test('every 12 hours: due from exactly twelve hours after the last refresh', function () {
    var now = at(4, 10);
    assert.equal(ask({ mode: 'twelve', now: now, items: [{ last: now - 12 * HOUR + 1, tried: 0 }] }), null);
    var item = { last: now - 12 * HOUR, tried: 0 };
    assert.equal(ask({ mode: 'twelve', now: now, items: [item] }), item);
});

test('a failed try waits an hour, then tries again', function () {
    var now = at(4, 10);
    var item = { last: at(1, 3), tried: now - 59 * 60000 };
    assert.equal(ask({ now: now, items: [item] }), null);
    item.tried = now - HOUR;
    assert.equal(ask({ now: now, items: [item] }), item);
});

test('the first due item is returned, in the order given, so sources go one at a time', function () {
    var now = at(4, 10);
    var fresh = { last: now - HOUR, tried: 0 };
    var first = { last: 0, tried: 0 };
    var second = { last: 0, tried: 0 };
    var items = [fresh, first, second];
    assert.equal(ask({ now: now, items: items }), first);
    first.last = now;
    assert.equal(ask({ now: now, items: items }), second);
    second.last = now;
    assert.equal(ask({ now: now, items: items }), null);
});

test('a refresh the viewer asked for is the last refresh, and removing the source forgets it', function () {
    var env = load(['auto-refresh.js'], {}, { XmltvGuide: {} });
    var Refresh = env.globals.AutoRefresh;
    assert.equal(Refresh.refreshedAt('s1'), 0);
    Refresh.mark('s1');
    assert.ok(Refresh.refreshedAt('s1') > 0);
    Refresh.forget('s1');
    assert.equal(Refresh.refreshedAt('s1'), 0);
});

// One Xtream source refreshed with a stand-in provider; fail(section, kind) may reject.
function refresh(options) {
    var log = [];
    var published = [];
    var env = load(['auto-refresh.js'], {}, {
        Log: { error: function () {} },
        XtreamSource: function () {
            return {
                sections: ['live'],
                categories: function () { return options.fail ? Promise.reject(options.fail) : Promise.resolve([{ category_id: '2' }]); },
                items: function () { return Promise.resolve([{ stream_id: 9, name: 'Fresh' }]); },
            };
        },
        Catalogue: {
            put: function (id, key) { log.push('put ' + id + ' ' + key); return Promise.resolve(); },
            dropCategoryItems: function (id) { log.push('drop ' + id); return Promise.resolve(); },
        },
    });
    var deps = { busy: function () { return !!options.busy; }, published: function (id, entries) { published.push({ id: id, entries: entries }); } };
    return env.globals.AutoRefresh.refreshSource({ id: 's2', type: 'xtream' }, deps).then(function () {
        return { log: log, published: published, saved: env.stored['iptvnator-tv:refreshed:s2'] && JSON.parse(env.stored['iptvnator-tv:refreshed:s2']) };
    });
}

test('a refreshed source drops its categories\' own saved lists after the whole sections, and hands the new lists on', async function () {
    var done = await refresh({});
    assert.deepEqual(done.log, ['put s2 live:categories', 'put s2 live:items:', 'drop s2']);
    assert.equal(done.published.length, 1);
    assert.equal(done.published[0].id, 's2');
    assert.equal(done.published[0].entries.map(function (entry) { return entry.key; }).join(' '), 'live:categories live:items:');
    assert.ok(done.saved.at > 0);
});

test('playback stopping a refresh is no failed try, but a busy provider (429) is, so the hour of waiting applies', async function () {
    var playing = await refresh({ busy: true });
    assert.equal(playing.saved, undefined);
    assert.deepEqual(playing.log, []);
    var throttled = Object.assign(new Error('Too many requests'), { code: 'busy' });
    var busy = await refresh({ fail: throttled });
    assert.ok(busy.saved.tried > 0);
    assert.equal(busy.published.length, 0);
});

test('Prefs defaults to Daily at night', function () {
    var Prefs = load(['settings-store.js']).globals.Prefs;
    assert.equal(Prefs.get('autoRefresh'), 'night');
});
