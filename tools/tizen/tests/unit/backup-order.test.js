'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fixture = require('../fixtures/backup/desktop-backup.json');
var load = require('./sandbox');
var files = ['profile-store.js', 'sources.js', 'progress-migration.js', 'library.js', 'progress.js', 'm3u-vod.js', 'm3u.js', 'audio-choice.js', 'move-mode.js', 'list-order.js', 'channel-groups.js', 'backup-order.js', 'backup-store.js', 'backup-m3u.js', 'backup.js'];

function app() {
    return load(files, {}, { URL: URL, SourceRequest: function () { return Promise.resolve(fixture.playlists[2].source.rawM3u); } });
}

test('#87/#76 both source types round-trip category/channel order and group snapshots, with Recent channels (#80), into the active profile', async function () {
    var env = app(), g = env.globals;
    await g.Backup.apply(g.Backup.parse(fixture), 'replace');
    var sources = g.Sources.all();
    sources.forEach(function (source) {
        var id = g.ChannelGroups.create(source.id, 'Evening');
        var channel = source.type === 'm3u' ? { name: 'News', url: 'https://fixture.invalid/live', group: 'News' } : { name: 'TV', stream_id: 1, category_id: '7' };
        g.ChannelGroups.add(source.id, id, channel);
        g.Stored.save(g.ProfileStore.key('recent-channels:' + source.id), [Object.assign({ watchedAt: 1000 }, channel)]);
        g.Stored.save(g.ProfileStore.key('list-order:' + source.id), { 'categories:live': ['__recentch', '2', id, '', '1'], 'channels:__fav': ['3', '1'] });
    });
    var manifest = await g.Backup.build();
    var restored = app().globals;
    var profile = restored.ProfileStore.add('Restored');
    restored.ProfileStore.setActive(profile.id);
    await restored.Backup.apply(restored.Backup.parse(JSON.stringify(manifest)), 'replace');
    restored.Sources.all().forEach(function (source, at) {
        var groups = restored.ChannelGroups.list(source.id);
        assert.equal(groups.length, 1);
        assert.equal(groups[0].name, 'Evening');
        assert.equal(groups[0].channels[0].category_id || groups[0].channels[0].group, at === 2 ? 'News' : '7');
        assert.equal(JSON.stringify(restored.Stored.json(restored.ProfileStore.key('list-order:' + source.id))), JSON.stringify(manifest.playlists[at].tvState.order));
        assert.equal(restored.Stored.json(restored.ProfileStore.key('recent-channels:' + source.id))[0].name, at === 2 ? 'News' : 'TV');
    });
    restored.ProfileStore.setActive('default');
    assert.equal(restored.ChannelGroups.list(restored.Sources.all()[0].id).length, 0);
});

test('Merge retains existing choices, adds unrelated groups/scopes, and invalid extension data writes nothing', async function () {
    var env = app(), g = env.globals;
    var manifest = JSON.parse(JSON.stringify(fixture));
    manifest.playlists = [manifest.playlists[0]];
    manifest.playlists[0].tvState = { order: { 'categories:live': ['2', '1'] }, groups: [{ id: '__group_tv', name: 'Imported', channels: [{ stream_id: 1, category_id: '7' }] }] };
    await g.Backup.apply(g.Backup.parse(manifest), 'replace');
    var source = g.Sources.all()[0].id;
    g.ChannelGroups.rename(source, '__group_tv', 'Kept');
    g.Stored.save(g.ProfileStore.key('list-order:' + source), { 'categories:live': ['1', '2'] });
    manifest.playlists[0].tvState.groups.push({ id: '__group_new', name: 'New', channels: [] });
    manifest.playlists[0].tvState.order['channels:__fav'] = ['3', '1'];
    await g.Backup.apply(g.Backup.parse(manifest), 'merge');
    assert.equal(g.ChannelGroups.list(source).map(function (group) { return group.name; }).join(','), 'Kept,New');
    assert.equal(g.Stored.json(g.ProfileStore.key('list-order:' + source))['categories:live'].join(','), '1,2');
    assert.equal(g.Stored.json(g.ProfileStore.key('list-order:' + source))['channels:__fav'].join(','), '3,1');
    var before = JSON.stringify(env.stored);
    [
        [],
        { order: { 'categories:live': [3] } },
        { order: { '__proto__': ['bad'], 'wrong:scope': [] } },
        { groups: [{ id: '__group_bad', name: 'Bad', channels: [{ series_id: 1 }] }] },
        { groups: [{ id: '__group_bad', name: '', channels: [] }] },
        { groups: [{ id: '__group_same', name: 'One', channels: [] }, { id: '__group_same', name: 'Two', channels: [] }] },
    ].forEach(function (invalid) {
        manifest.playlists[0].tvState = invalid;
        assert.throws(function () { g.Backup.parse(manifest); }, /Invalid backup/);
        assert.equal(JSON.stringify(env.stored), before);
    });
});

test('#90 guide links, their order and hand-picked guide channels round-trip, picks and channel orders follow the new source ids', async function () {
    var env = load(files.concat(['guide-pick.js']), {}, { URL: URL, SourceRequest: function () { return Promise.resolve(fixture.playlists[2].source.rawM3u); } });
    var g = env.globals;
    await g.Backup.apply(g.Backup.parse(fixture), 'replace');
    var sources = g.Sources.all().map(function (source) { return Object.assign({}, source); });
    sources[0] = Object.assign(sources[0], { epgUrl: 'https://guide.test/a.xml', epgUrl2: 'https://guide.test/b.xml.gz', epgOffset: 2, epgOrder: ['2', 'provider', '1'], epgPrefer: true });
    g.Sources.replace(sources);
    g.GuidePick.replaceAll(sources[0].id, { 'id:5': { n: 2, id: 'beinsports1.qa' } });
    // Favorites across all sources name a channel of the second source.
    g.Stored.save(g.ProfileStore.key('list-order:' + sources[0].id), { 'channels:__fav': [sources[1].id + '|2', '1'] });
    var manifest = await g.Backup.build();
    var restored = load(files.concat(['guide-pick.js']), {}, { URL: URL, SourceRequest: function () { return Promise.resolve(fixture.playlists[2].source.rawM3u); } }).globals;
    restored.Sources.replace([{ id: sources[1].id, type: 'm3u', name: 'Taken id', url: 'https://other.test/list.m3u' }]);
    await restored.Backup.apply(restored.Backup.parse(JSON.stringify(manifest)), 'replace');
    var back = restored.Sources.all();
    assert.equal(back[0].epgUrl, 'https://guide.test/a.xml');
    assert.equal(back[0].epgUrl2, 'https://guide.test/b.xml.gz');
    assert.equal(back[0].epgOffset, 2);
    assert.equal(back[0].epgOrder.join(','), '2,provider,1');
    assert.equal(JSON.stringify(restored.GuidePick.all(back[0].id)), JSON.stringify({ 'id:5': { n: 2, id: 'beinsports1.qa' } }));
    assert.equal(JSON.stringify(restored.GuidePick.all(sources[1].id)), '{}');
    assert.equal(restored.Stored.json(restored.ProfileStore.key('list-order:' + back[0].id))['channels:__fav'].join(','), back[1].id + '|2,1');
});

test('#90 a full TV while restoring guide picks fails the import and keeps the old picks', async function () {
    var env = load(files.concat(['guide-pick.js']), {}, { URL: URL, SourceRequest: function () { return Promise.resolve(fixture.playlists[2].source.rawM3u); } });
    var g = env.globals;
    await g.Backup.apply(g.Backup.parse(fixture), 'replace');
    var sources = g.Sources.all().map(function (source) { return Object.assign({}, source); });
    sources[0] = Object.assign(sources[0], { epgUrl: 'https://guide.test/a.xml' });
    g.Sources.replace(sources);
    g.GuidePick.replaceAll(sources[0].id, { 'id:5': { n: 1, id: 'beinsports1.qa' } });
    var manifest = await g.Backup.build();
    // The TV already holds a pick; the restore runs out of space on its guide picks.
    var records = {};
    var target = load(files.concat(['guide-pick.js']), records, { URL: URL, SourceRequest: function () { return Promise.resolve(fixture.playlists[2].source.rawM3u); } });
    var t = target.globals;
    t.Sources.replace([{ id: 'mine', type: 'm3u', name: 'Mine', url: 'https://mine.test/list.m3u', epgUrl: 'https://guide.test/mine.xml' }]);
    t.GuidePick.replaceAll('mine', { 'id:9': { n: 1, id: 'mine.channel' } });
    var setItem = t.localStorage.setItem;
    var full = true;
    // The first guide-pick write finds the TV full; the rollback frees the space again.
    t.localStorage.setItem = function (key, value) {
        if (full && key.indexOf('iptvnator-tv:guide-pick:') === 0) { full = false; throw new Error('QuotaExceededError'); }
        return setItem.call(this, key, value);
    };
    assert.throws(function () { t.Backup.apply(t.Backup.parse(JSON.stringify(manifest)), 'replace'); }, /Could not save backup/);
    t.localStorage.setItem = setItem;
    assert.equal(t.Sources.all()[0].id, 'mine');
    assert.equal(JSON.stringify(JSON.parse(target.stored['iptvnator-tv:guide-pick:mine'])), JSON.stringify({ 'id:9': { n: 1, id: 'mine.channel' } }));
});