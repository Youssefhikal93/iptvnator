'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var files = ['profile-store.js', 'settings-store.js', 'library.js', 'channel-groups.js', 'hidden-categories.js', 'parental-lock.js', 'kids-profile.js', 'visibility.js'];
var channel = function (id, category) { return { stream_id: id, name: 'Channel ' + id, category_id: category }; };

test('#76 groups persist independently per viewer/source; membership is unique and names/removal do not alter the provider identity', function () {
    var env = load(files), g = env.globals;
    var id = g.ChannelGroups.create('s1', 'My TV');
    g.ChannelGroups.add('s1', id, channel(1, '7'));
    g.ChannelGroups.add('s1', id, channel(1, '7'));
    g.ChannelGroups.add('s1', id, { name: 'M3U channel', url: 'https://fixture.invalid/one', group: 'News' });
    var again = load(files, env.stored).globals;
    assert.equal(again.ChannelGroups.items('s1', id).length, 2);
    assert.equal(again.ChannelGroups.items('s1', id)[0].category_id, '7');
    assert.equal(again.ChannelGroups.items('s1', id)[1].group, 'News');
    assert.equal(g.ChannelGroups.list('s2').length, 0);
    g.ProfileStore.setActive(g.ProfileStore.add('Other').id);
    assert.equal(g.ChannelGroups.list('s1').length, 0);
    g.ProfileStore.setActive('default');
    g.ChannelGroups.rename('s1', id, 'Renamed');
    assert.equal(g.ChannelGroups.list('s1')[0].name, 'Renamed');
    g.ChannelGroups.removeChannel('s1', id, channel(1, '7'));
    assert.equal(g.ChannelGroups.items('s1', id).length, 1);
    g.ChannelGroups.remove('s1', id);
    assert.equal(g.ChannelGroups.list('s1').length, 0);
});

test('fresh catalogue resolves group channels and removes vanished ones; Kids and locks still check their real categories', function () {
    var g = load(files).globals;
    var kids = g.ProfileStore.add('Kids');
    g.ProfileStore.setKids(kids.id, 'default');
    g.ProfileStore.setActive(kids.id);
    g.KidsProfile.save(kids.id, 's1', { live: ['7'], movies: [], series: [] });
    var id = g.ChannelGroups.create('s1', 'TV');
    [channel(1, '7'), channel(2, '8'), channel(3, '7')].forEach(function (item) { g.ChannelGroups.add('s1', id, item); });
    var catalogue = [Object.assign(channel(1, '7'), { name: 'Fresh name' }), channel(2, '8')];
    var visible = g.Visibility(function () { return 's1'; });
    var row = g.ChannelGroups.rows('s1', catalogue, function (item) { return visible.allows('live', item, { withHidden: true }); })[0];
    assert.equal(row.count, 1);
    assert.equal(row.list().length, 2);
    var allowed = visible.items('live', row.list(), { withHidden: true });
    assert.equal(allowed.length, 1);
    assert.equal(allowed[0].name, 'Fresh name');
    assert.equal(allowed[0].category_id, '7');
    g.ParentalLock.setPin('1234');
    g.ParentalLock.lock('s1', 'live', '7');
    assert.equal(visible.items('live', row.list(), { withHidden: true }).length, 0);
});
