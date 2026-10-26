'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var sandbox = require('./sandbox');

function deferred() {
    var resolve, reject;
    var promise = new Promise(function (yes, no) { resolve = yes; reject = no; });
    return { promise: promise, resolve: resolve, reject: reject };
}

function settle() {
    return new Promise(setImmediate);
}

function memoryStore(saved) {
    var records = new Map(Object.entries(saved || {}));
    return {
        records: records,
        get: function (source, key) { return Promise.resolve(records.get(source + '|' + key)); },
        put: function (source, key, catalogue) { records.set(source + '|' + key, catalogue); },
        drop: function (source) {
            records.forEach(function (catalogue, key) {
                if (key.indexOf(source + '|') === 0) records.delete(key);
            });
            return Promise.resolve();
        },
    };
}

function fixture(options) {
    options = options || {};
    var globals = sandbox(['catalogue.js', 'catalogue-loader.js'], {}, { Log: { error: function () {} } }).globals;
    var updates = [];
    var calls = [];
    var screens = [];
    var adapter = {};
    ['categories', 'items', 'seriesInfo', 'movieInfo'].forEach(function (method) {
        adapter[method] = function () {
            calls.push([method].concat(Array.prototype.slice.call(arguments)));
            return options.fetch ? options.fetch() : Promise.resolve([]);
        };
    });
    var store = options.unavailable ? globals.Catalogue : options.store || memoryStore(options.saved);
    var loader = globals.CatalogueLoader({
        sourceId: options.source || 'A',
        adapter: adapter,
        store: store,
        screen: function (key, run, active) {
            screens.push({ key: key, active: active });
            return Promise.resolve().then(run);
        },
        onUpdating: function (count) { updates.push(count); },
    });
    return { loader: loader, store: store, calls: calls, updates: updates, screens: screens };
}

test('saved lists return first, refresh once, and publish only changed lists', async function () {
    for (var changed of [false, true]) {
        var saved = [{ stream_id: 1, name: 'Saved' }];
        var fresh = [{ stream_id: 1, name: changed ? 'Fresh' : 'Saved' }];
        var provider = deferred();
        var f = fixture({ saved: { 'A|live:items:7': saved }, fetch: function () { return provider.promise; } });
        var what = { section: 'live', kind: 'items', id: 7 };
        var notices = [];
        var options = { onFresh: function (list) { notices.push(list); } };
        assert.equal(f.loader.peek(what), undefined);
        assert.equal(await f.loader.load(what, options), saved);
        assert.deepEqual(f.updates, [1]);
        assert.deepEqual(notices, []);
        await f.loader.load(what, options);
        provider.resolve(fresh);
        await settle();
        assert.equal(f.loader.peek(what), fresh);
        assert.deepEqual(notices, changed ? [fresh] : []);
        assert.deepEqual(f.updates, [1, 0]);
        await f.loader.load(what, options);
        assert.equal(f.calls.length, 1);
        assert.equal(f.store.records.get('A|live:items:7'), fresh);
    }
});

test('saved delivery precedes a refresh even when the provider resolves immediately', async function () {
    var f = fixture({ saved: { 'A|live:items:': [1] }, fetch: function () { return Promise.resolve([2]); } });
    var deliveries = [];
    await f.loader.load({ section: 'live', kind: 'items' }, {
        onFresh: function () { deliveries.push('fresh'); },
    }).then(function () { deliveries.push('saved'); });
    await settle();
    assert.deepEqual(deliveries, ['saved', 'fresh']);
});

test('disposing a source rejects late reads and fetches without publishing or saving', async function () {
    for (var phase of ['saved', 'provider', 'failure', 'background', 'memory']) {
        var delayed = deferred();
        var saved = [{ name: 'Old' }];
        var store = memoryStore(phase === 'background' ? { 'A|series:2': saved } : {});
        if (phase === 'saved') {
            var read = store.get;
            store.get = function (source, key) { return source === 'A' ? delayed.promise : read(source, key); };
        }
        var f = fixture({ store: store, fetch: function () { return phase === 'memory' ? Promise.resolve(saved) : delayed.promise; } });
        var what = { kind: 'show', id: 2 };
        var notices = [];
        var loading = f.loader.load(what, { onFresh: function (list) { notices.push(list); } });
        if (phase === 'background' || phase === 'memory') await loading;
        else await settle();
        if (phase === 'memory') loading = f.loader.load(what);
        var rejected = phase === 'background' ? null : assert.rejects(loading, { code: 'cancelled' });
        f.loader.dispose();
        var next = fixture({ store: store, source: 'B' });
        await next.loader.load(what);
        if (phase === 'failure') delayed.reject(new Error('Old source failed'));
        else delayed.resolve([{ name: 'Late' }]);
        if (rejected) await rejected;
        await settle();
        assert.equal(f.loader.peek(what), undefined);
        assert.deepEqual(notices, []);
        assert.equal(f.updates[f.updates.length - 1], 0);
        assert.equal(next.loader.peek(what).length, 0);
        assert.equal(store.records.get('A|series:2'), phase === 'background' || phase === 'memory' ? saved : undefined);
        await assert.rejects(f.loader.load(what), { code: 'cancelled' });
    }
});

test('failed loads can retry with either saved-store adapter and share pending info requests', async function () {
    for (var unavailable of [false, true]) {
        for (var kind of ['categories', 'items', 'show', 'movie']) {
            var provider = deferred();
            var f = fixture({ unavailable: unavailable, fetch: function () { return provider.promise; } });
            var what = { section: 'movies', kind: kind, id: 3 };
            var first = f.loader.load(what);
            var second = f.loader.load(what);
            assert.equal(first, second);
            var rejected = Promise.all([assert.rejects(first, /offline/), assert.rejects(second, /offline/)]);
            await settle();
            assert.equal(f.loader.peek(what), undefined);
            provider.reject(new Error('offline'));
            await rejected;
            assert.equal(f.loader.peek(what), undefined);
            provider = deferred();
            var retry = f.loader.load(what);
            provider.resolve([]);
            assert.equal((await retry).length, 0);
            assert.equal((await f.loader.load(what)).length, 0);
            assert.equal(f.calls.length, 2);
        }
    }
});

test('drop waits for deletion, forgets memory and blocks old refreshes from repopulating it', async function () {
    var old = deferred();
    var deleted = deferred();
    var store = memoryStore({ 'A|live:items:': [1], 'B|live:items:': [9] });
    var remove = store.drop;
    store.drop = function (source) { return deleted.promise.then(function () { return remove(source); }); };
    var response = old.promise;
    var f = fixture({ store: store, fetch: function () { return response; } });
    var what = { section: 'live', kind: 'items' };
    await f.loader.load(what);
    var dropping = f.loader.drop();
    assert.equal(f.loader.peek(what), undefined);
    old.resolve([2]);
    await settle();
    response = Promise.resolve([3]);
    var loading = f.loader.load(what);
    await settle();
    assert.equal(f.calls.length, 1);
    deleted.resolve();
    await dropping;
    assert.deepEqual(await loading, [3]);
    assert.deepEqual(store.records.get('A|live:items:'), [3]);
    assert.deepEqual(store.records.get('B|live:items:'), [9]);
    assert.deepEqual(f.updates, [1, 0]);
});

test('legacy saved keys and full item metadata are preserved; movie details stay session-only', async function () {
    var store = memoryStore({ 'A|live:categories': ['categories'], 'A|series:items:': ['shows'], 'A|series:4': { episodes: [] } });
    var f = fixture({ store: store });
    assert.equal((await f.loader.load({ section: 'live', kind: 'categories' }))[0], 'categories');
    assert.equal((await f.loader.load({ section: 'series', kind: 'items', id: '' }))[0], 'shows');
    assert.equal((await f.loader.load({ section: 'series', kind: 'show', id: 4 })).episodes.length, 0);
    var movie = { stream_id: 4, name: 'Fallback title', cover: 'poster' };
    await f.loader.load({ kind: 'movie', id: 4, item: movie });
    await settle();
    var request = f.calls.filter(function (call) { return call[0] === 'movieInfo'; })[0];
    assert.equal(request[1], movie);
    assert.equal(store.records.has('A|vod:4'), false);
});

test('LoadScreen runs only when requested and uses the caller visibility predicate', async function () {
    var f = fixture();
    await f.loader.load({ section: 'live', kind: 'categories' });
    assert.equal(f.screens.length, 0);
    var visible = false;
    await f.loader.load({ kind: 'movie', id: 8 }, { screen: true, active: function () { return visible; } });
    assert.equal(f.screens.length, 1);
    assert.equal(f.screens[0].active(), false);
    visible = true;
    assert.equal(f.screens[0].active(), true);
    f.loader.dispose();
    assert.equal(f.screens[0].active(), false);
});

test('failed background refresh keeps saved items, clears updating and is not repeated', async function () {
    var saved = [1];
    var f = fixture({ saved: { 'A|live:items:': saved }, fetch: function () { return Promise.reject(new Error('offline')); } });
    var what = { section: 'live', kind: 'items' };
    assert.equal(await f.loader.load(what), saved);
    await settle();
    assert.equal(await f.loader.load(what), saved);
    assert.deepEqual(f.updates, [1, 0]);
    assert.equal(f.calls.length, 1);
});

test('updating counts overlapping refreshes until both have finished', async function () {
    var categories = deferred();
    var items = deferred();
    var response = categories.promise;
    var f = fixture({ saved: { 'A|live:categories': [], 'A|live:items:': [] }, fetch: function () { return response; } });
    await f.loader.load({ section: 'live', kind: 'categories' });
    response = items.promise;
    await f.loader.load({ section: 'live', kind: 'items' });
    categories.resolve([]);
    await settle();
    assert.deepEqual(f.updates, [1, 2, 1]);
    items.resolve([]);
    await settle();
    assert.deepEqual(f.updates, [1, 2, 1, 0]);
});
