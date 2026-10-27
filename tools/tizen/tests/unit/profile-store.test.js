'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

var P = 'iptvnator-tv:';
var D = P + 'p:default:';
var VIEWER_FILES = ['profile-store.js', 'settings-store.js', 'progress.js', 'sort.js', 'library.js', 'library-all.js', 'sources.js', 'new-episodes.js', 'hidden-categories.js', 'parental-lock.js'];

// Everything the app wrote before profiles existed.
function oldData() {
    var data = {};
    data[P + 'sources'] = JSON.stringify([{ id: 's1', type: 'xtream', name: 'One', url: 'http://x.test', user: 'u', pass: 'p' }]);
    data[P + 'current'] = JSON.stringify('s1');
    data[P + 'progress'] = JSON.stringify({ 'movie:1': { position: 5, duration: 10 } });
    data[P + 'settings'] = JSON.stringify({ homeLayout: 'showcase', tmdbApiKey: 'secret-key' });
    data[P + 'view:movies'] = 'list';
    data[P + 'favorites:s1'] = JSON.stringify({ movies: [{ name: 'A', stream_id: 1 }] });
    data[P + 'recent:s1'] = JSON.stringify({ movies: [{ name: 'A', stream_id: 1, watchedAt: 1 }] });
    data[P + 'last-channel:s1'] = JSON.stringify({ name: 'Ch', stream_id: 9 });
    data[P + 'sort:s1'] = JSON.stringify({ movies: 'name' });
    data[P + 'seen:s1'] = JSON.stringify({ 3004: 5 });
    data[P + 'hidden-categories:s1'] = JSON.stringify({ live: ['12'] });
    data[P + 'locked-categories:s1'] = JSON.stringify({ live: ['3'] });
    data[P + 'pin'] = JSON.stringify({ salt: 's', hash: 'h' });
    data[P + 'backup:s1'] = JSON.stringify({ progressIds: ['movie:1'] });
    data[P + 'guide:s1'] = JSON.stringify({ status: 'ok' });
    return data;
}

var MOVED = ['progress', 'view:movies', 'favorites:s1', 'recent:s1', 'last-channel:s1', 'sort:s1', 'seen:s1', 'hidden-categories:s1', 'locked-categories:s1', 'pin', 'backup:s1'];
var SHARED = ['sources', 'current', 'guide:s1'];

function app(stored, overrides) {
    return load(['profile-store.js'], stored, overrides);
}

// A storage that refuses writes to the keys in `failing.keys`.
function flaky(records, failing) {
    return {
        getItem: function (key) { return records[key] === undefined ? null : records[key]; },
        setItem: function (key, value) {
            if (failing.keys.indexOf(key) !== -1) throw new Error('quota');
            records[key] = String(value);
        },
        removeItem: function (key) { delete records[key]; },
        key: function (index) { return Object.keys(records)[index] || null; },
        get length() { return Object.keys(records).length; },
    };
}

test('a fresh install gets the default profile Me and the version marker', function () {
    var run = app({});
    var profiles = run.globals.ProfileStore.list();
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].id, 'default');
    assert.equal(profiles[0].name, 'Me');
    assert.equal(run.globals.ProfileStore.active().id, 'default');
    assert.equal(run.stored[P + 'profiles-version'], '1');
    assert.equal(run.globals.ProfileStore.key('progress'), D + 'progress');
});

test('key mapping puts the profile segment after the shared prefix', function () {
    var store = app({}).globals.ProfileStore;
    assert.equal(store.key('favorites:s1'), 'iptvnator-tv:p:default:favorites:s1');
    assert.equal(store.key('locked-categories:a:b'), 'iptvnator-tv:p:default:locked-categories:a:b');
    var other = store.add('Anna');
    store.setActive(other.id);
    assert.equal(store.key('pin'), P + 'p:' + other.id + ':pin');
});

test('migration moves every per-viewer key under the default profile and keeps shared keys', function () {
    var before = oldData();
    var run = app(before);
    MOVED.forEach(function (name) {
        assert.equal(run.stored[P + name], undefined, 'old ' + name + ' removed');
        assert.equal(run.stored[D + name], before[P + name], 'new ' + name + ' identical');
    });
    SHARED.forEach(function (name) {
        assert.equal(run.stored[P + name], before[P + name]);
    });
    assert.equal(run.stored[P + 'profiles-version'], '1');
    assert.equal(run.stored[P + 'profile'], 'default');
});

test('migration keeps the TMDB key shared and out of the profile settings', function () {
    var run = load(['profile-store.js', 'settings-store.js'], oldData());
    var prefs = run.globals.Prefs;
    assert.equal(prefs.get('tmdbApiKey'), 'secret-key');
    assert.equal(prefs.get('homeLayout'), 'showcase');
    assert.equal(JSON.parse(run.stored[D + 'settings']).tmdbApiKey, undefined);
    assert.equal(JSON.parse(run.stored[P + 'shared-settings']).tmdbApiKey, 'secret-key');
});

test('migration is idempotent: running it again changes nothing', function () {
    var run = app(oldData());
    var snapshot = JSON.stringify(run.stored);
    run.globals.ProfileStore.init();
    assert.equal(JSON.stringify(run.stored), snapshot);
    var again = app(run.stored);
    assert.equal(JSON.stringify(again.stored), snapshot);
});

test('an interrupted copy is finished by the next start without losing data', function () {
    var before = oldData();
    var records = Object.assign({}, before);
    var failing = { keys: [D + 'seen:s1'] };
    var first = load(['profile-store.js'], {}, { localStorage: flaky(records, failing) });
    // The first load above ran on an empty store; restart on the old data with a failing key.
    Object.assign(records, before);
    delete records[P + 'profiles-version'];
    first.globals.ProfileStore.init();
    assert.equal(records[P + 'profiles-version'], undefined, 'marker waits for every key');
    assert.equal(records[P + 'seen:s1'], before[P + 'seen:s1'], 'old key kept when its copy failed');
    assert.equal(records[D + 'progress'], before[P + 'progress'], 'other keys still moved');
    failing.keys = [];
    first.globals.ProfileStore.init();
    assert.equal(records[P + 'profiles-version'], '1');
    assert.equal(records[P + 'seen:s1'], undefined);
    assert.equal(records[D + 'seen:s1'], before[P + 'seen:s1']);
});

test('a key copied before the interruption but not yet deleted is just deleted', function () {
    var before = oldData();
    before[D + 'progress'] = before[P + 'progress'];
    before[P + 'profiles'] = JSON.stringify([{ id: 'default', name: 'Me', color: '#78adff' }]);
    var run = app(before);
    assert.equal(run.stored[P + 'progress'], undefined);
    assert.equal(run.stored[D + 'progress'], before[P + 'progress']);
    assert.equal(run.stored[P + 'profiles-version'], '1');
});

test('a different value already under the profile wins and the old key is not lost', function () {
    var before = oldData();
    before[D + 'progress'] = JSON.stringify({ 'movie:2': { position: 1, duration: 2 } });
    var run = app(before);
    assert.equal(run.stored[D + 'progress'], before[D + 'progress']);
    assert.equal(run.stored[P + 'progress'], before[P + 'progress']);
});

test('old keys that appear after the marker is set are left alone', function () {
    var run = app({});
    run.stored[P + 'favorites:s1'] = '{}';
    run.globals.ProfileStore.init();
    assert.equal(run.stored[P + 'favorites:s1'], '{}');
});

test('a damaged profile list falls back to the default profile; an unknown active id too', function () {
    var run = app({ [P + 'profiles']: '{broken', [P + 'profile']: 'ghost' });
    assert.equal(run.globals.ProfileStore.list().length, 1);
    assert.equal(run.globals.ProfileStore.active().id, 'default');
    var two = app({ [P + 'profiles']: JSON.stringify([{ id: 'a', name: 'A', color: 'red' }, { id: 'b', name: 'B', color: 'blue' }]), [P + 'profile']: 'b' });
    assert.equal(two.globals.ProfileStore.active().id, 'b');
    var ghost = app({ [P + 'profiles']: JSON.stringify([{ id: 'a', name: 'A', color: 'red' }]), [P + 'profile']: 'ghost' });
    assert.equal(ghost.globals.ProfileStore.active().id, 'a');
});

test('profiles: add, rename, name rules, the six-profile limit and switch events', function () {
    var run = app({});
    var store = run.globals.ProfileStore;
    var switched = [];
    store.onSwitch(function (id) { switched.push(id); });
    var anna = store.add('  Anna ');
    assert.equal(anna.name, 'Anna');
    assert.notEqual(anna.color, store.list()[0].color);
    assert.equal(store.add('anna'), null, 'names are unique, ignoring case');
    assert.equal(store.add(''), null);
    assert.equal(store.add(new Array(30).join('x')), null);
    assert.equal(store.rename(anna.id, 'Anne'), true);
    assert.equal(store.rename(anna.id, 'Me'), false);
    assert.equal(JSON.parse(run.stored[P + 'profiles'])[1].name, 'Anne');
    assert.equal(store.setActive(anna.id), true);
    assert.equal(store.setActive(anna.id), false, 'no event when nothing changes');
    assert.equal(switched.length, 1);
    assert.equal(run.stored[P + 'profile'], anna.id);
    for (var i = 0; store.list().length < 6; i++) assert.ok(store.add('P' + i));
    assert.equal(store.add('Seventh'), null);
});

test('deleting a profile removes only its keys; the last profile cannot be deleted', function () {
    var run = app(oldData());
    var store = run.globals.ProfileStore;
    assert.equal(store.remove('default'), false, 'the last profile stays');
    var anna = store.add('Anna');
    store.setActive(anna.id);
    run.stored[store.key('favorites:s1')] = '{}';
    assert.equal(store.remove(anna.id), true);
    assert.equal(store.active().id, 'default');
    assert.equal(Object.keys(run.stored).some(function (key) { return key.indexOf(P + 'p:' + anna.id + ':') === 0; }), false);
    assert.equal(run.stored[D + 'progress'] !== undefined, true);
    assert.equal(store.list().length, 1);
});

test('profiles keep favorites, recents, progress, settings, hidden and locked categories apart', function () {
    var run = load(VIEWER_FILES.concat(['progress-migration.js']), oldData());
    var g = run.globals;
    var movie = { name: 'A', stream_id: 1 };
    assert.equal(g.Library.isFavorite('s1', 'movies', movie), true);
    assert.equal(g.Progress.of('movie:1').position, 5);
    assert.equal(g.Prefs.get('homeLayout'), 'showcase');
    assert.equal(g.HiddenCategories.isHidden('s1', 'live', '12'), true);
    assert.equal(g.ParentalLock.hasPin(), true);
    assert.equal(g.ParentalLock.isLocked('s1', 'live', '3'), true);

    var anna = g.ProfileStore.add('Anna');
    g.ProfileStore.setActive(anna.id);
    assert.equal(g.Library.isFavorite('s1', 'movies', movie), false);
    assert.equal(g.Library.favorites('s1', 'movies').length, 0);
    assert.equal(g.Library.recent('s1', 'movies').length, 0);
    assert.equal(g.Library.lastChannel('s1'), null);
    assert.equal(g.Progress.of('movie:1'), null);
    assert.equal(g.Prefs.get('homeLayout'), 'cinema');
    assert.equal(g.HiddenCategories.isHidden('s1', 'live', '12'), false);
    assert.equal(g.ParentalLock.hasPin(), false);
    assert.equal(g.ParentalLock.isLocked('s1', 'live', '3'), false);
    assert.equal(g.LibraryAll.favorites('movies', 's1').length, 0, 'the cross-source library follows the active profile');

    g.Library.toggleFavorite('s1', 'movies', { name: 'B', stream_id: 2 });
    g.Prefs.set('homeLayout', 'showcase');
    g.Prefs.set('homeLayout', 'cinema');
    g.Progress.save('movie:2', 50, 100);
    g.ProfileStore.setActive('default');
    assert.equal(g.Library.favorites('s1', 'movies').length, 1);
    assert.equal(g.Library.favorites('s1', 'movies')[0].name, 'A');
    assert.equal(g.LibraryAll.favorites('movies', 's1')[0].name, 'A');
    assert.equal(g.Progress.of('movie:2'), null);
    assert.equal(g.Prefs.get('homeLayout'), 'showcase');
});

test('the TMDB key and the ask-on-start choice are shared by all profiles', function () {
    var run = load(VIEWER_FILES, oldData());
    var g = run.globals;
    assert.equal(g.Prefs.get('askProfile'), true);
    var anna = g.ProfileStore.add('Anna');
    g.ProfileStore.setActive(anna.id);
    assert.equal(g.Prefs.get('tmdbApiKey'), 'secret-key');
    g.Prefs.set('askProfile', false);
    g.Prefs.set('tmdbApiKey', 'other');
    g.ProfileStore.setActive('default');
    assert.equal(g.Prefs.get('askProfile'), false);
    assert.equal(g.Prefs.get('tmdbApiKey'), 'other');
});

test('a profile switch locks the parental session again', function () {
    var run = load(VIEWER_FILES, {}, {});
    var g = run.globals;
    g.ParentalLock.setPin('1234');
    assert.equal(g.ParentalLock.unlock('1234'), true);
    assert.equal(g.ParentalLock.isUnlocked(), true);
    var anna = g.ProfileStore.add('Anna');
    g.ProfileStore.setActive(anna.id);
    assert.equal(g.ParentalLock.isUnlocked(), false);
});
