'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fixture = require('../fixtures/backup/desktop-backup.json');
var load = require('./sandbox');
var PREFIX = 'iptvnator-tv:';

function app(stored, overrides) {
    var records = Object.assign({}, stored);
    return load(['sources.js', 'progress-migration.js', 'library.js', 'progress.js', 'm3u-vod.js', 'm3u.js', 'audio-choice.js', 'backup-order.js', 'backup-store.js', 'backup-m3u.js', 'backup.js'], records,
        Object.assign({ URL: URL, SourceRequest: function () { return Promise.resolve(fixture.playlists[2].source.rawM3u); } }, overrides));
}

function archive() { return JSON.parse(JSON.stringify(fixture)); }

test('desktop import and TV export preserve typed library, credentials, recents, progress and watched state', async function () {
    var tv = app();
    var backup = tv.globals.Backup;
    var parsed = backup.parse(archive());
    assert.equal(backup.summary(parsed), '3 sources, 4 favorites, 3 watch positions');
    backup.apply(parsed, 'replace');
    var sources = tv.globals.Sources.all();
    assert.equal(sources.length, 3);
    assert.equal(sources[0].user, 'fake-viewer');
    assert.equal(sources[0].pass, 'fake-password');
    assert.equal(tv.globals.Library.favorites(sources[0].id, 'movies')[0].stream_id, 2025);
    assert.equal(tv.globals.Library.favorites(sources[0].id, 'series')[0].series_id, 3004);
    assert.equal(tv.globals.Library.recent(sources[2].id, 'live')[0].name, 'News');
    assert.equal(tv.globals.Progress.resumeFrom('movie:2025', 6730), 200);
    assert.equal(tv.globals.Progress.isWatched('movie:2026'), true);
    var exported = await backup.build();
    assert.equal(exported.kind, fixture.kind);
    assert.equal(exported.includeSecrets, true);
    assert.equal(exported.playlists[2].source.rawM3u, fixture.playlists[2].source.rawM3u);
    var positions = exported.playlists[0].userState.playbackPositions;
    assert.equal(exported.playlists[0].userState.recentlyViewed.length, 2);
    assert.equal(positions.length, 3);
    assert.equal(positions.filter(function (position) { return position.contentType === 'episode'; })[0].seriesXtreamId, 3004);
    var restored = app();
    restored.globals.Backup.apply(restored.globals.Backup.parse(JSON.stringify(exported)), 'replace');
    assert.equal(restored.globals.Progress.resumeFrom('episode:4001', 2640), 400);
    assert.equal(restored.globals.Progress.isWatched('movie:2026'), true);
    assert.equal(restored.globals.Library.favorites(restored.globals.Sources.all()[0].id, 'movies')[0].name, 'Movie 25');
});

test('Merge matches normalized type/address/username, unions favorites, and chooses timestamps over furthest position', function () {
    var stored = {};
    stored[PREFIX + 'sources'] = JSON.stringify([{ id: 'old', type: 'xtream', name: 'Kept', url: 'https://tv.example.invalid/', user: 'fake-viewer', pass: 'keep-password' }]);
    stored[PREFIX + 'current'] = JSON.stringify('old');
    stored[PREFIX + 'favorites:old'] = JSON.stringify({ movies: [{ stream_id: 2025, name: 'Existing' }, { stream_id: 2001, name: 'Keep' }] });
    stored[PREFIX + 'recent:old'] = JSON.stringify({ movies: [{ stream_id: 2025, name: 'Newer view', watchedAt: Date.parse('2026-10-27') }] });
    stored[PREFIX + 'progress'] = JSON.stringify({ 'movie:2025': { position: 50, duration: 6730, updatedAt: Date.parse('2026-10-27') }, 'movie:2026': { position: 500, duration: 600, updatedAt: 1 } });
    var tv = app(stored);
    tv.globals.Backup.apply(tv.globals.Backup.parse(archive()), 'merge');
    assert.equal(tv.globals.Sources.all().length, 3);
    assert.equal(tv.globals.Sources.current().id, 'old');
    assert.equal(tv.globals.Sources.all()[0].pass, 'keep-password');
    assert.equal(tv.globals.Library.favorites('old', 'movies').length, 2);
    assert.equal(tv.globals.Library.recent('old', 'movies')[0].name, 'Newer view');
    assert.equal(tv.globals.Progress.of('movie:2025').position, 50);
    assert.equal(tv.globals.Progress.isWatched('movie:2026'), true);
    var differentUser = archive();
    differentUser.playlists = [differentUser.playlists[0]];
    differentUser.playlists[0].connection.username = 'another-viewer';
    tv.globals.Backup.apply(tv.globals.Backup.parse(differentUser), 'merge');
    assert.equal(tv.globals.Sources.all().length, 4);
});

test('invalid and unknown archives, including a late damaged entry, never change saved data', function () {
    var tv = app({ 'iptvnator-tv:sources': '[]', 'iptvnator-tv:progress': '{"movie:1":{"position":1,"duration":1}}' });
    var broken = archive();
    broken.playlists[1].userState.playbackPositions = null;
    var malicious = archive();
    malicious.playlists[0].userState.favorites[0].contentType = '__proto__';
    ['broken JSON', [], { kind: 'wrong', version: 1, playlists: [] }, Object.assign(archive(), { version: 2 }), broken, malicious].forEach(function (invalid) {
        var before = JSON.stringify(tv.stored);
        assert.throws(function () { tv.globals.Backup.parse(invalid); });
        assert.equal(JSON.stringify(tv.stored), before);
    });
});

test('Replace clears removed-source library and old progress, and unsupported sources cannot empty the TV', function () {
    var stored = {};
    stored[PREFIX + 'sources'] = JSON.stringify([{ id: 'old', type: 'm3u', url: 'https://old.invalid/list', name: 'Old' }]);
    stored[PREFIX + 'favorites:old'] = '{"live":[{"url":"old"}]}';
    stored[PREFIX + 'last-channel:old'] = '{"stream_id":1001}';
    stored[PREFIX + 'progress'] = '{"movie:99":{"position":100,"duration":500}}';
    var tv = app(stored);
    var skipped = archive();
    skipped.playlists.push({ portalType: 'stalker', exportedId: 's', title: 'Skipped', userState: {} });
    assert.equal(tv.globals.Backup.parse(skipped).skipped, 1);
    tv.globals.Backup.apply(tv.globals.Backup.parse(skipped), 'replace');
    assert.equal(tv.globals.Progress.of('movie:99'), null);
    assert.equal(tv.stored[PREFIX + 'progress:old'], undefined);
    assert.equal(tv.globals.Library.favorites('old', 'live').length, 0);
    assert.equal(tv.globals.Library.lastChannel('old'), null);
    skipped.playlists = [skipped.playlists[3]];
    assert.throws(function () { tv.globals.Backup.parse(skipped); }, /No supported sources/);
});

test('M3U TV extension preserves movie/show favorites, episode recents and progress without changing desktop v1 fields', async function () {
    var manifest = archive();
    manifest.playlists = [manifest.playlists[2]];
    manifest.playlists[0].source.rawM3u = '#EXTM3U\n#EXTINF:-1 group-title="Movies",Film\nhttps://m.invalid/movie/film.mp4\n#EXTINF:-1 group-title="Series",Show S01E01 Pilot\nhttps://m.invalid/series/pilot.mp4\n';
    manifest.playlists[0].userState.favorites = ['https://m.invalid/movie/film.mp4', 'https://m.invalid/series/pilot.mp4'];
    manifest.playlists[0].userState.recentlyViewed = [{ source: 'm3u', url: 'https://m.invalid/series/pilot.mp4', title: 'Show', category_id: 'live', added_at: 100 }];
    var tv = app({}, { SourceRequest: function () { return Promise.resolve(manifest.playlists[0].source.rawM3u); } });
    await tv.globals.Backup.apply(tv.globals.Backup.parse(manifest), 'replace');
    var source = tv.globals.Sources.all()[0];
    var recent = tv.globals.Library.recent(source.id, 'series')[0];
    tv.globals.Progress.save(tv.globals.Progress.episodeId(recent.episode), 200, 1000);
    var exported = await tv.globals.Backup.build();
    assert.equal(exported.playlists[0].userState.favorites.length, 2);
    assert.equal(exported.playlists[0].userState.recentlyViewed[0].url, 'https://m.invalid/series/pilot.mp4');
    var restored = app();
    restored.globals.Backup.apply(restored.globals.Backup.parse(exported), 'replace');
    assert.equal(restored.globals.Library.favorites(restored.globals.Sources.all()[0].id, 'series').length, 1);
    assert.equal(restored.globals.Progress.of(tv.globals.Progress.episodeId(recent.episode)).position, 200);
});

test('a quota failure rolls back every previously written backup key', function () {
    var records = { 'iptvnator-tv:sources': '[]', 'iptvnator-tv:progress': '{}' };
    var writes = 0;
    var tv = app({}, { localStorage: {
        getItem: function (key) { return records[key] === undefined ? null : records[key]; },
        setItem: function (key, value) { if (++writes === 3) throw new Error('QuotaExceededError'); records[key] = value; },
        removeItem: function (key) { delete records[key]; },
    } });
    var before = JSON.stringify(records);
    assert.throws(function () { tv.globals.Backup.apply(tv.globals.Backup.parse(archive()), 'replace'); }, /Could not save backup/);
    assert.deepEqual(records, JSON.parse(before));
});

test('#34 backup keeps colliding source positions separate and its TV extension uses the current source', async function () {
    var manifest = archive();
    var first = manifest.playlists[0];
    var second = JSON.parse(JSON.stringify(first));
    second.exportedId = 'other';
    second.connection.username = 'another-viewer';
    first.userState.playbackPositions = [first.userState.playbackPositions[0]];
    second.userState.playbackPositions = [Object.assign({}, first.userState.playbackPositions[0], { positionSeconds: 600, updatedAt: '2026-10-28T00:00:00Z' })];
    manifest.playlists = [first, second];
    var tv = app();
    await tv.globals.Backup.apply(tv.globals.Backup.parse(manifest), 'replace');
    var sources = tv.globals.Sources.all();
    assert.equal(tv.globals.Progress.of('movie:2025').position, 200);
    assert.equal(tv.globals.Progress.of('movie:2025', sources[1].id).position, 600);
    tv.globals.Sources.setCurrent(sources[1].id);
    var exported = await tv.globals.Backup.build();
    assert.equal(exported.tvState.progress['movie:2025'].position, 600);
    assert.equal(exported.playlists[0].userState.playbackPositions[0].positionSeconds, 200);
    assert.equal(exported.playlists[1].userState.playbackPositions[0].positionSeconds, 600);
    // A portable extension has no source id; it belongs to the import's current source.
    exported.tvState.progress['movie:99'] = { position: 120, duration: 1000, updatedAt: 1 };
    var restored = app();
    await restored.globals.Backup.apply(restored.globals.Backup.parse(exported), 'replace');
    var restoredSources = restored.globals.Sources.all();
    assert.equal(restored.globals.Progress.of('movie:99').position, 120);
    assert.equal(restored.globals.Progress.of('movie:99', restoredSources[1].id), null);
    assert.equal(restored.globals.Progress.of('movie:2025').position, 200);
    assert.equal(restored.globals.Progress.of('movie:2025', restoredSources[1].id).position, 600);
});

test('#34 a failed import rolls back scoped progress and leaves the other source untouched', function () {
    var stored = {};
    stored[PREFIX + 'sources'] = JSON.stringify([{ id: 'old', type: 'xtream', url: 'https://tv.example.invalid', user: 'fake-viewer', name: 'Existing' }]);
    stored[PREFIX + 'current'] = '"old"';
    stored[PREFIX + 'progress:old'] = '{"movie:2025":{"position":50,"duration":6730,"updatedAt":1}}';
    stored[PREFIX + 'progress:other'] = '{"movie:2025":{"position":300,"duration":6730,"updatedAt":1}}';
    var tv = app(stored);
    var before = JSON.stringify(tv.stored);
    var originalSet = tv.globals.localStorage.setItem;
    var failed = false;
    tv.globals.localStorage.setItem = function (key, value) {
        if (!failed && key === PREFIX + 'current') {
            failed = true;
            throw new Error('quota');
        }
        originalSet(key, value);
    };
    assert.throws(function () { tv.globals.Backup.apply(tv.globals.Backup.parse(archive()), 'merge'); }, /Could not save backup/);
    assert.deepEqual(tv.stored, JSON.parse(before));
    assert.equal(tv.globals.Progress.of('movie:2025').position, 50);
    assert.equal(tv.globals.Progress.of('movie:2025', 'other').position, 300);
});

test('#83 backup remaps channel and show choices on Replace, keeps existing picks on Merge, and isolates profiles', async function () {
    var tv = app();
    var env = tv.globals;
    env.Sources.replace([{ id: 'old', type: 'xtream', name: 'Saved TV', url: 'https://tv.invalid', user: 'viewer', pass: '' }]);
    env.AudioChoice.remember({ live: true, channel: 'old|1001' }, 'en');
    env.AudioChoice.rememberSubtitle({ live: true, channel: 'old|1001' }, false);
    env.AudioChoice.remember({ episodes: { show: 'old|3001' } }, 'ar');
    env.AudioChoice.rememberSubtitle({ episodes: { show: 'old|3001' } }, 'en');
    var exported = await env.Backup.build();
    assert.equal(exported.tvState.audioChoice.textChannels['old|1001'], false);
    var restored = load(['profile-store.js', 'sources.js', 'progress-migration.js', 'library.js', 'progress.js',
        'm3u-vod.js', 'm3u.js', 'audio-choice.js', 'backup-order.js', 'backup-store.js', 'backup-m3u.js', 'backup.js'], {}, { URL: URL }).globals;
    await restored.Backup.apply(restored.Backup.parse(JSON.stringify(exported)), 'replace');
    var source = restored.Sources.all()[0].id;
    var channel = { live: true, channel: source + '|1001' };
    var show = { episodes: { show: source + '|3001' } };
    var tracks = [{ ref: 1, language: 'en' }, { ref: 2, language: 'ar' }];
    assert.equal(restored.AudioChoice.pick(channel, tracks).ref, 1);
    assert.equal(restored.AudioChoice.subtitle(channel), false);
    assert.equal(restored.AudioChoice.pick(show, tracks).ref, 2);
    assert.equal(restored.AudioChoice.subtitle(show), 'en');
    restored.AudioChoice.rememberSubtitle(channel, 'ar');
    await restored.Backup.apply(restored.Backup.parse(exported), 'merge');
    assert.equal(restored.AudioChoice.subtitle(channel), 'ar');
    var other = restored.ProfileStore.add('Other');
    restored.ProfileStore.setActive(other.id);
    assert.equal(restored.AudioChoice.subtitle(channel), undefined);
    await restored.Backup.apply(restored.Backup.parse(exported), 'merge');
    assert.equal(restored.AudioChoice.subtitle(channel), false);
    restored.ProfileStore.setActive('default');
    assert.equal(restored.AudioChoice.subtitle(channel), 'ar');
    delete exported.tvState.audioChoice;
    await restored.Backup.apply(restored.Backup.parse(exported), 'replace');
    assert.equal(restored.AudioChoice.subtitle(channel), undefined, 'old backups remain supported');
});
