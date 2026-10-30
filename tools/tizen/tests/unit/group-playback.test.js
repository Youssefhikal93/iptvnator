'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

test('#76 zapping, drawer selection and Previous channel retain the originating group order', async function () {
    var g = load(['library.js', 'live-channels.js']).globals;
    var one = { stream_id: 1, category_id: '7' }, two = { stream_id: 2, category_id: '8' };
    var group = [two, one];
    var live = g.LiveChannels({
        // Catalogue/provider boundary. Group membership does not change category_id.
        categories: function () { return Promise.resolve([{ category_id: '7' }, { category_id: '__group_tv' }, { category_id: '8' }]); },
        channels: function () { return Promise.resolve([one, two]); },
        request: function (channel) { return { channel: channel }; },
        record: function () {},
    });
    assert.equal(live.play(two, group, '__group_tv').channel, two);
    assert.equal(live.zap(1).channel, one);
    assert.equal(live.zap(1), null);
    var view = await live.view();
    assert.equal(view.categories[view.index].category_id, '__group_tv');
    assert.equal(live.previous().channel, two);
    assert.equal(live.zap(1).channel, one);
    assert.equal(two.category_id, '8');
    live.reorder('__group_tv', [one, two]);
    assert.equal(live.zap(1).channel, two);
});

test('#80/#87 the drawer shows Recent channels in its saved category place once it has channels', async function () {
    var g = load(['library.js', 'live-channels.js']).globals;
    var one = { stream_id: 1, category_id: '7' };
    var recent = [];
    var live = g.LiveChannels({
        categories: function () { return Promise.resolve([{ category_id: '__fav' }, { category_id: '__group_tv' }, { category_id: '__recentch' }, { category_id: '7' }]); },
        channels: function () { return Promise.resolve([one]); },
        request: function (channel) { return { channel: channel }; },
        record: function () {},
        recent: function () { return recent; },
    });
    var ids = function (view) { return view.categories.map(function (row) { return row.category_id; }).join(','); };
    assert.equal(ids(await live.view()), '__fav,__group_tv,7');
    recent = [one];
    var view = await live.view();
    assert.equal(ids(view), '__fav,__group_tv,__recentch,7');
    assert.equal(view.categories[2].recent, true);
    assert.equal(view.categories[2].category_name, 'Recent channels');
});
