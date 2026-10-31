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

// One Xtream source refreshed with a stand-in provider. Options: fail (every
// categories call rejects with it), login (account() rejects with it),
// sections, list(section, kind) for a stand-in answer, saved (the lists
// already saved, by key) and busy (a flag, or a function asked each step).
function refresh(options) {
    var log = [];
    var published = [];
    var env = load(['auto-refresh.js'], {}, {
        Log: { error: function () {} },
        XtreamSource: function () {
            function answer(section, kind, fallback) {
                var list = options.list ? options.list(section, kind) : fallback;
                return list instanceof Error ? Promise.reject(list) : Promise.resolve(list);
            }
            return {
                sections: options.sections || ['live'],
                account: function () { log.push('account'); return options.login ? Promise.reject(options.login) : Promise.resolve({ auth: 1 }); },
                categories: function (section) { return options.fail ? Promise.reject(options.fail) : answer(section, 'categories', [{ category_id: '2' }]); },
                items: function (section) { return answer(section, 'items', [{ stream_id: 9, name: 'Fresh' }]); },
            };
        },
        Catalogue: {
            get: function (id, key) { return Promise.resolve((options.saved || {})[key]); },
            put: function (id, key) { log.push('put ' + id + ' ' + key); return Promise.resolve(); },
            dropCategoryItems: function (id) { log.push('drop ' + id); return Promise.resolve(); },
        },
    });
    var busy = typeof options.busy === 'function' ? options.busy : function () { return !!options.busy; };
    var deps = { busy: busy, published: function (id, entries, adapter) { published.push({ id: id, entries: entries, adapter: adapter }); } };
    return env.globals.AutoRefresh.refreshSource({ id: 's2', type: 'xtream' }, deps).then(function () {
        return { log: log, published: published, saved: env.stored['iptvnator-tv:refreshed:s2'] && JSON.parse(env.stored['iptvnator-tv:refreshed:s2']) };
    });
}

test('a refreshed source drops its categories\' own saved lists after the whole sections, and hands the new lists on', async function () {
    var done = await refresh({});
    assert.deepEqual(done.log, ['account', 'put s2 live:categories', 'put s2 live:items:', 'drop s2']);
    assert.equal(done.published.length, 1);
    assert.equal(done.published[0].id, 's2');
    assert.equal(done.published[0].entries.map(function (entry) { return entry.key; }).join(' '), 'live:categories live:items:');
    // The adapter that fetched them goes along, for a playlist's open adapter to adopt.
    assert.equal(typeof done.published[0].adapter.categories, 'function');
    assert.ok(done.saved.at > 0);
});

test('playback stopping a refresh is no failed try, but a busy provider (429) is, so the hour of waiting applies', async function () {
    var playing = await refresh({ busy: true });
    assert.equal(playing.saved, undefined);
    assert.deepEqual(playing.log, ['account']);
    var throttled = Object.assign(new Error('Too many requests'), { code: 'busy' });
    var busy = await refresh({ fail: throttled });
    assert.ok(busy.saved.tried > 0);
    assert.equal(busy.published.length, 0);
});

test('a rejected Xtream login (HTTP 200, auth 0) is a failed try that leaves the saved catalogue alone', async function () {
    var rejected = Object.assign(new Error('Check the login'), { code: 'account', reason: 'login' });
    // Such a server also answers every list empty; none of it may be saved.
    var done = await refresh({ login: rejected, list: function () { return []; } });
    assert.deepEqual(done.log, ['account']);
    assert.equal(done.published.length, 0);
    assert.ok(done.saved.tried > 0);
    assert.equal(done.saved.at, undefined);
});

test('a refresh that fails midway saves none of its lists', async function () {
    var down = Object.assign(new Error('HTTP 502'), { code: 'http' });
    var done = await refresh({
        sections: ['live', 'movies'],
        list: function (section, kind) { return section === 'movies' && kind === 'categories' ? down : [{ category_id: '2', stream_id: 9 }]; },
    });
    assert.deepEqual(done.log, ['account']);
    assert.equal(done.published.length, 0);
    assert.ok(done.saved.tried > 0);
});

test('playback starting midway leaves every saved list as it was', async function () {
    var asked = 0;
    var done = await refresh({ sections: ['live', 'movies'], busy: function () { return ++asked > 2; } });
    assert.deepEqual(done.log, ['account']);
    assert.equal(done.saved, undefined);
});

test('a list that comes back empty where the saved one had entries is a failed try, not a wipe', async function () {
    var done = await refresh({
        list: function (section, kind) { return kind === 'items' ? [] : [{ category_id: '2' }]; },
        saved: { 'live:items:': [{ stream_id: 1 }, { stream_id: 2 }] },
    });
    assert.deepEqual(done.log, ['account']);
    assert.ok(done.saved.tried > 0);
    // An empty list where nothing was saved before is simply saved.
    var fresh = await refresh({ list: function (section, kind) { return kind === 'items' ? [] : [{ category_id: '2' }]; } });
    assert.deepEqual(fresh.log, ['account', 'put s2 live:categories', 'put s2 live:items:', 'drop s2']);
});

test('Prefs defaults to Daily at night', function () {
    var Prefs = load(['settings-store.js']).globals.Prefs;
    assert.equal(Prefs.get('autoRefresh'), 'night');
});
