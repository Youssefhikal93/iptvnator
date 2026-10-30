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
