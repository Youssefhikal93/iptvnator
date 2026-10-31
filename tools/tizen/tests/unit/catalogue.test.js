'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

test('a background refresh replaces the sections in memory and forgets a category\'s own list', async function () {
    var create = load(['catalogue-loader.js'], {}, { Log: { error: function () {} } }).globals.CatalogueLoader;
    var store = { 'live:items:': [{ stream_id: 1 }], 'live:items:2': [{ stream_id: 1 }] };
    var asked = [];
    var loader = create({
        sourceId: 's1',
        adapter: { items: function (section, id) { asked.push(id); return Promise.resolve([{ stream_id: 1 }, { stream_id: 2 }]); } },
        store: { get: function (id, key) { return Promise.resolve(store[key]); }, put: function (id, key, value) { store[key] = value; } },
        stamps: { get: function () { return Date.now(); }, set: function () {} },
        onUpdating: function () {},
    });
    await loader.load({ section: 'live', kind: 'items' });
    await loader.load({ section: 'live', kind: 'items', id: '2' });
    // The refresh saved new whole lists and dropped "live:items:2" from the store.
    delete store['live:items:2'];
    loader.refreshed([{ key: 'live:items:', value: [{ stream_id: 1 }, { stream_id: 2 }] }]);
    assert.equal(loader.peek({ section: 'live', kind: 'items' }).length, 2);
    assert.equal(loader.peek({ section: 'live', kind: 'items', id: '2' }), undefined);
    var category = await loader.load({ section: 'live', kind: 'items', id: '2' });
    assert.equal(category.length, 2);
    assert.deepEqual(asked, ['2']);
});

test('refresh comparison notices length, identity, order, artwork and nested metadata changes', async function () {
    var create = load(['catalogue-loader.js'], {}, { Log: { error: function () {} } }).globals.CatalogueLoader;
    var saved = [{ stream_id: 1, num: 1, name: 'One', icon: 'old', meta: { rating: 4 } }];
    var scenarios = [
        [[], false],
        [[{ stream_id: 2, num: 1, name: 'One', icon: 'old', meta: { rating: 4 } }], false],
        [[{ stream_id: 1, num: 1, name: 'One', icon: 'new', meta: { rating: 4 } }], false],
        [[{ stream_id: 1, num: 1, name: 'One', icon: 'old', meta: { rating: 5 } }], false],
        [JSON.parse(JSON.stringify(saved)), true],
        [[{ stream_id: 1 }, { stream_id: 2 }], [{ stream_id: 2 }, { stream_id: 1 }], false],
        [{ episodes: [1] }, { episodes: [2] }, false],
        [[], [], true],
        [[null], [null], true],
        [[{}], [null], false],
    ];
    for (var scenario of scenarios) {
        var previous = scenario.length === 3 ? scenario[1] : saved;
        var equal = scenario[scenario.length - 1];
        var fresh = [];
        var loader = create({
            sourceId: 'source',
            adapter: { items: function () { return Promise.resolve(scenario[0]); } },
            store: {
                get: function () { return Promise.resolve(previous); },
                put: function () {},
            },
            onUpdating: function () {},
        });
        await loader.load({ section: 'live', kind: 'items' }, { onFresh: function (list) { fresh.push(list); } });
        await new Promise(setImmediate);
        assert.equal(fresh.length, equal ? 0 : 1);
    }
});
