'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var fixture = require('../fixtures/backup/desktop-backup.json');
var files = ['profile-store.js', 'sources.js', 'source-identity.js', 'progress-migration.js', 'library.js', 'library-all.js', 'progress.js',
    'xmltv-parser.js', 'quality.js', 'genres.js', 'find.js', 'm3u-vod.js', 'm3u.js', 'audio-choice.js', 'channel-edits.js', 'backup-order.js', 'backup-store.js', 'backup-m3u.js', 'backup.js', 'full-backup.js'];
var provider = { stream_id: 1001, name: 'UK| SKY SPORTS MAIN EVENT FHD ᴿᴬᵂ', stream_icon: 'http://localhost:8262/img/poster.jpg', category_id: '2' };
var logo = 'http://localhost:8262/img/backdrop.jpg';
var plain = function (entry) { return JSON.parse(JSON.stringify(entry)); };

function app(stored) {
    return load(files, stored, { URL: URL, SourceRequest: function () { return Promise.resolve(fixture.playlists[2].source.rawM3u); } });
}

test('#96 views follow the active profile, keep source accounts apart and reset both without altering provider snapshots', function () {
    var env = app(), g = env.globals;
    var shown = g.ChannelEdits.view('s1', provider);
    g.ChannelEdits.save('s1', shown, { name: 'My sports', logo: logo });
    assert.equal(shown.name, 'My sports');
    assert.equal(shown.stream_icon, logo);
    assert.equal(g.ChannelEdits.view('s2', provider).name, provider.name);
    var other = g.ProfileStore.add('Other');
    g.ProfileStore.setActive(other.id);
    assert.equal(shown.name, provider.name);
    g.ProfileStore.setActive('default');
    assert.equal(shown.name, 'My sports');
    assert.deepEqual(plain(g.Library.snapshot(shown)), provider);
    var restarted = app(env.stored).globals;
    assert.equal(restarted.ChannelEdits.view('s1', provider).name, 'My sports');
    restarted.ChannelEdits.save('s1', provider, null);
    assert.equal(restarted.ChannelEdits.view('s1', provider).name, provider.name);
    assert.equal(restarted.ChannelEdits.view('s1', provider).stream_icon, provider.stream_icon);
});

test('#96 favorites, recent channels, own snapshots and all-source libraries retain provider values when saved again', function () {
    var g = app().globals;
    g.Sources.replace([{ id: 's1', type: 'xtream', name: 'Local', url: 'http://localhost:8262', user: 'fixture', pass: 'fixture' }]);
    var shown = g.ChannelEdits.view('s1', provider);
    g.ChannelEdits.save('s1', shown, { name: 'My sports', logo: logo });
    g.Library.toggleFavorite('s1', 'live', shown);
    g.Library.addRecent('s1', 'live', shown);
    g.Library.addRecentChannel('s1', shown);
    g.Library.addRecentChannel('s1', { stream_id: 1002, name: 'Other' });
    [g.Library.favorites('s1', 'live')[0], g.Library.recent('s1', 'live')[0], g.Library.recentChannels('s1')[1], g.LibraryAll.favorites('live', 's1')[0]].forEach(function (channel) {
        assert.equal(channel.name, 'My sports');
        assert.equal(channel.stream_icon, logo);
    });
    g.ChannelEdits.save('s1', shown, null);
    assert.equal(g.Library.recentChannels('s1')[1].name, provider.name);
    assert.equal(g.Library.favorites('s1', 'live')[0].stream_icon, provider.stream_icon);
});

test('#96 channel copies ignore quality and RAW decorations but retain country, number and regional distinctions', function () {
    var g = app().globals;
    var catalogue = [
        { stream_id: 1002, name: 'UK| SKY SPORTS MAIN EVENT HD', stream_icon: logo },
        { stream_id: 1003, name: 'UK| SKY SPORTS MAIN EVENT 4K', stream_icon: logo },
        { stream_id: 1004, name: 'US| SKY SPORTS MAIN EVENT HD', stream_icon: logo },
        { stream_id: 1005, name: 'UK| SKY SPORTS MAIN EVENT EXTRA HD', stream_icon: logo },
        { stream_id: 1006, name: 'UK| SKY SPORTS MAIN EVENT SD', stream_icon: '' },
    ];
    g.ChannelEdits.save('s1', provider, { name: 'My sports' });
    assert.deepEqual(Array.from(g.ChannelEdits.copies(g.ChannelEdits.view('s1', provider), catalogue), function (channel) { return channel.stream_id; }), [1002]);
    assert.equal(g.ChannelEdits.copies({ name: 'Sport 1 HD', stream_id: 1 }, [{ name: 'Sport 2 HD', stream_id: 2, stream_icon: logo }]).length, 0);
});

test('#96 logos come from channels of the same main name: same channel first, then same country; numbers must agree', function () {
    var g = app().globals;
    var art = function (name) { return 'http://localhost:8262/img/' + name + '.jpg'; };
    var bein = { stream_id: 1, name: 'UK| beIN Sports 1 HD', stream_icon: art('own') };
    var catalogue = [
        { stream_id: 5, name: 'beIN 1', stream_icon: art('d') },
        { stream_id: 3, name: 'AR| beIN Sports 1 HD', stream_icon: art('b') },
        { stream_id: 4, name: 'UK| beIN Sport 1', stream_icon: art('c') },
        { stream_id: 2, name: 'UK| BEIN SPORTS 1 4K HEVC', stream_icon: art('a') },
        { stream_id: 8, name: 'UK| beIN Sports 1 FHD', stream_icon: art('a') },
        { stream_id: 6, name: 'UK| beIN Sports 2 HD', stream_icon: art('e') },
        { stream_id: 7, name: 'UK| Sky Sports 1', stream_icon: art('f') },
    ];
    var ids = function (list) { return Array.from(list, function (channel) { return channel.stream_id; }); };
    // A renamed channel still searches by the provider's name.
    g.ChannelEdits.save('s1', bein, { name: 'Football' });
    assert.deepEqual(ids(g.ChannelEdits.copies(g.ChannelEdits.view('s1', bein), catalogue)), [2, 4, 5, 3]);
    assert.deepEqual(ids(g.ChannelEdits.copies({ stream_id: 9, name: 'beIN Sport HD' }, catalogue)), [5, 3, 4, 2, 6]);
    assert.equal(g.ChannelEdits.matches(bein, 'beIN SPORTS 1.qa'), true);
    assert.equal(g.ChannelEdits.matches(bein, 'beIN SPORTS 2.qa'), false);
    assert.equal(g.ChannelEdits.matches(bein, 'Sky Sports 1'), false);
});

test('#96 search matches either name; guide and playback quality matching retain provider identity', function () {
    var g = app().globals;
    var channel = { stream_id: 1, name: 'Sports 1 HD' };
    var shown = g.ChannelEdits.view('s1', channel);
    g.ChannelEdits.save('s1', shown, { name: 'Weekend TV' });
    ['weekend', 'sports'].forEach(function (query) { assert.equal(g.Find.rank([shown], 'live', query)[0], shown); });
    assert.equal(g.Find.rank([shown], 'movies', 'sports').length, 0);
    assert.equal(g.XmltvParser.match(shown, { ids: {}, names: { sports1: 'guide1' } }), 'guide1');
    assert.equal(g.Quality.copies(shown, [{ stream_id: 2, name: 'Sports 1 FHD' }], true).length, 2);
});

test('#96 M3U edit identities are stable without saving stream addresses; unsafe artwork and malformed imports are rejected', function () {
    var g = app().globals;
    var channel = { name: 'News', url: 'http://localhost:8262/live/private/secret/1.ts' };
    assert.match(g.ChannelEdits.keyOf(channel), /^m3u:[a-f0-9]+$/);
    g.ChannelEdits.save('s1', channel, { name: 'Local news' });
    var saved = g.Stored.text(g.ProfileStore.key('channel-edits:s1'));
    assert.ok(!saved.includes('private') && !saved.includes('secret') && !saved.includes('http'));
    ['', 'javascript:alert(1)', 'http://user:pass@localhost/a.png', 'http://localhost/a.png?password=secret', channel.url].forEach(function (address) {
        assert.equal(g.ChannelEdits.image(address), '');
    });
    assert.throws(function () { g.ChannelEdits.clean({ 'id:1': { name: ' ' } }); }, /Invalid/);
    assert.throws(function () { g.ChannelEdits.clean({ 'id:1': { logo: 'javascript:alert(1)' } }); }, /Invalid/);
});

test('#96 a failed edit write leaves the saved name and artwork intact', function () {
    var g = app().globals;
    var shown = g.ChannelEdits.view('s1', provider);
    g.ChannelEdits.save('s1', provider, { name: 'Keep this', logo: logo });
    g.localStorage.setItem = function () { throw new Error('QuotaExceededError'); };
    assert.throws(function () { g.ChannelEdits.save('s1', provider, { name: 'Unsaved' }); }, /Quota/);
    assert.equal(shown.name, 'Keep this');
    assert.equal(shown.logo, logo);
});

test('#96 export/Replace remaps edits for both source types; Merge keeps existing edits, older backups clear only the active profile', async function () {
    var g = app().globals;
    await g.Backup.apply(g.Backup.parse(fixture), 'replace');
    g.Sources.all().forEach(function (source) { g.ChannelEdits.save(source.id, source.type === 'm3u' ? { url: 'http://localhost:8262/live/a/b/1.ts' } : provider, { name: 'My sports', logo: logo }); });
    var manifest = await g.Backup.build();
    manifest.playlists.forEach(function (source) { assert.equal(Object.values(source.tvState.channelEdits)[0].name, 'My sports'); });
    var target = app().globals;
    await target.Backup.apply(target.Backup.parse(plain(manifest)), 'replace');
    target.Sources.all().forEach(function (source) {
        assert.equal(Object.values(target.Stored.json(target.ProfileStore.key('channel-edits:' + source.id)))[0].logo, logo);
    });
    var first = target.Sources.all()[0];
    target.ChannelEdits.save(first.id, provider, { name: 'Keep mine' });
    await target.Backup.apply(target.Backup.parse(plain(manifest)), 'merge');
    assert.equal(target.ChannelEdits.view(first.id, provider).name, 'Keep mine');
    var backup = target.FullBackup.collect();
    target.ChannelEdits.save(first.id, provider, null);
    target.FullBackup.apply(target.FullBackup.parse(JSON.stringify(backup)));
    assert.equal(target.ChannelEdits.view(first.id, provider).name, 'Keep mine');
    var other = target.ProfileStore.add('Other');
    target.ProfileStore.setActive(other.id);
    var legacy = plain(manifest);
    legacy.playlists.forEach(function (entry) { delete entry.tvState.channelEdits; });
    await target.Backup.apply(target.Backup.parse(legacy), 'replace');
    target.ProfileStore.setActive('default');
    assert.equal(target.ChannelEdits.view(first.id, provider).name, 'Keep mine');
});
