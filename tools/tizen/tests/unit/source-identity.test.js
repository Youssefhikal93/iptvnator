'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var FILES = ['sources.js', 'source-identity.js', 'library.js', 'library-all.js'];
var SOURCE = { id: 's1', type: 'xtream', name: 'Living room', url: 'https://example.test', user: 'viewer-login', pass: 'private-password' };

function source(changes) {
    return Object.assign({}, SOURCE, changes);
}

function app(stored, files, overrides) {
    return load(FILES.concat(files || []), Object.assign({
        'iptvnator-tv:sources': JSON.stringify([source()]),
        'iptvnator-tv:current': JSON.stringify('s1'),
    }, stored), Object.assign({
        URL: URL,
        Date: { now: function () { return 100; } },
        Log: { error: function (message) { throw new Error(message); } },
    }, overrides));
}

[
    ['password-only change', { pass: 'replacement-password' }],
    ['rename', { name: 'Bedroom' }],
    ['guide settings change', { epgUrl: 'https://guide.test/list.xml', epgOffset: 2, epgPrefer: false }],
    ['host case and trailing slash', { url: 'HTTPS://EXAMPLE.TEST/' }],
    ['server path change', { url: 'https://example.test/another/path/' }],
    ['explicit default port', { url: 'https://example.test:443/' }],
].forEach(function (scenario) {
    test(scenario[0] + ' keeps the source id', function () {
        var identity = app().globals.SourceIdentity;
        var updated = source(scenario[1]);
        assert.equal(identity.sameAccount(SOURCE, updated), true);
        assert.equal(identity.resolveId(SOURCE, updated), 's1');
    });
});

[
    ['other host', { url: 'https://other.test' }],
    ['other scheme', { url: 'http://example.test' }],
    ['other port', { url: 'https://example.test:8443' }],
    ['other username', { user: 'another-viewer' }],
    ['username case change', { user: 'Viewer-login' }],
    ['source type change', { type: 'm3u' }],
].forEach(function (scenario) {
    test(scenario[0] + ' gets a new source id', function () {
        var identity = app().globals.SourceIdentity;
        var updated = source(scenario[1]);
        assert.equal(identity.sameAccount(SOURCE, updated), false);
        assert.equal(identity.resolveId(SOURCE, updated), 's100');
    });
});

test('M3U identity includes the full playlist URL', function () {
    var identity = app().globals.SourceIdentity;
    var old = source({ type: 'm3u', url: 'https://example.test/one.m3u?token=one' });
    assert.equal(identity.resolveId(old, Object.assign({}, old, { name: 'Renamed' })), old.id);
    ['https://example.test/two.m3u?token=one', 'https://example.test/one.m3u?token=two'].forEach(function (url) {
        assert.equal(identity.sameAccount(old, Object.assign({}, old, { url: url })), false);
        assert.notEqual(identity.resolveId(old, Object.assign({}, old, { url: url })), old.id);
    });
});

test('switching back restores the previous id after restart and across profiles', function () {
    var env = app();
    var updated = source({ user: 'another-viewer' });
    updated.id = env.globals.SourceIdentity.resolveId(SOURCE, updated);
    env.globals.Sources.rekey(SOURCE.id, updated);
    env = app(env.stored, [], { ProfileStore: { key: function (name) { return 'iptvnator-tv:p:other:' + name; } } });
    var restored = source({ url: 'https://EXAMPLE.test/path', pass: 'new-password' });
    assert.equal(env.globals.SourceIdentity.resolveId(updated, restored), 's1');
});

test('fingerprints and the shared map contain no plain login or password', function () {
    var env = app();
    var identity = env.globals.SourceIdentity;
    var fingerprint = identity.fingerprint(SOURCE);
    assert.match(fingerprint, /^a[0-9a-f]{1,8}$/);
    assert.equal(fingerprint, identity.fingerprint(source({ pass: 'different-password' })));
    identity.resolveId(SOURCE, source({ user: 'another-viewer' }));
    var saved = env.stored['iptvnator-tv:source-accounts'];
    [SOURCE.url, SOURCE.user, SOURCE.pass, 'another-viewer'].forEach(function (secret) {
        assert.equal(fingerprint.indexOf(secret), -1);
        assert.equal(saved.indexOf(secret), -1);
    });
});

test('rekey preserves source order, name and guide settings and moves only the current pointer', function () {
    var env = app({ 'iptvnator-tv:sources': JSON.stringify([source({ id: 'before' }), source(), source({ id: 'after' })]) });
    var updated = source({ id: 's100', user: 'other', epgUrl: 'https://guide.test/guide.xml', epgOffset: 2, epgPrefer: false });
    env.globals.Sources.rekey('s1', updated);
    var sources = env.globals.Sources.all();
    assert.equal(sources.map(function (entry) { return entry.id; }).join(','), 'before,s100,after');
    assert.equal(sources[1].name, SOURCE.name);
    assert.equal(sources[1].epgUrl, updated.epgUrl);
    assert.equal(sources[1].epgOffset, 2);
    assert.equal(sources[1].epgPrefer, false);
    assert.equal(env.globals.Sources.current().id, 's100');
    env.globals.Sources.rekey('after', source({ id: 's101' }));
    assert.equal(env.globals.Sources.current().id, 's100');
});

test('rapid account changes never reuse an id belonging to different history', function () {
    var env = app({ 'iptvnator-tv:sources': JSON.stringify([source({ id: 's100' })]) });
    var old = source({ id: 's100' });
    ['second', 'third'].forEach(function (user, index) {
        var updated = source({ user: user });
        updated.id = env.globals.SourceIdentity.resolveId(old, updated);
        assert.equal(updated.id, 's' + (101 + index));
        env.globals.Sources.rekey(old.id, updated);
        old = updated;
    });
});

test('returning to an account already saved separately does not merge source ids', function () {
    var other = source({ id: 's2', user: 'other' });
    var env = app({ 'iptvnator-tv:sources': JSON.stringify([source(), other]) });
    var accounts = {};
    accounts[env.globals.SourceIdentity.fingerprint(other)] = 's2';
    env.stored['iptvnator-tv:source-accounts'] = JSON.stringify(accounts);
    var updated = source({ user: 'other' });
    updated.id = env.globals.SourceIdentity.resolveId(SOURCE, updated);
    env.globals.Sources.rekey('s1', updated);
    assert.equal(env.globals.Sources.all().map(function (entry) { return entry.id; }).join(','), 's100,s2');
});

test('all-sources views omit orphaned history and restore it with the original account', function () {
    var env = app();
    var globals = env.globals;
    var movie = { stream_id: 7, name: 'Old movie' };
    globals.Library.toggleFavorite('s1', 'movies', movie);
    globals.Library.addRecent('s1', 'movies', movie);
    globals.Library.setLastChannel('s1', { stream_id: 3, name: 'Old channel' });
    var before = Object.assign({}, env.stored);
    var updated = source({ user: 'other' });
    updated.id = globals.SourceIdentity.resolveId(SOURCE, updated);
    globals.Sources.rekey('s1', updated);
    assert.equal(globals.LibraryAll.favorites('movies', updated.id).length, 0);
    assert.equal(globals.LibraryAll.recent('movies', updated.id).length, 0);
    assert.equal(globals.Library.lastChannel(updated.id), null);
    assert.equal(globals.Library.favorites('s1', 'movies')[0].name, movie.name);
    var restored = source();
    restored.id = globals.SourceIdentity.resolveId(updated, restored);
    globals.Sources.rekey(updated.id, restored);
    assert.equal(globals.LibraryAll.favorites('movies', restored.id)[0].name, movie.name);
    assert.equal(globals.LibraryAll.recent('movies', restored.id)[0].name, movie.name);
    assert.equal(globals.Library.lastChannel(restored.id).name, 'Old channel');
    Object.keys(before).filter(function (key) { return /favorites:|recent:|last-channel:/.test(key); }).forEach(function (key) {
        assert.equal(env.stored[key], before[key]);
    });
});

test('editing the account refreshes an unchanged guide under the new id and forgets stale account health', async function () {
    var manifests = {};
    var downloads = 0;
    var removed = [];
    var errors = [];
    var env = app({}, ['xmltv-parser.js', 'xmltv.js', 'source-account.js', 'source-edit.js'], {
        Date: Date,
        AbortController: AbortController,
        ReadableStream: ReadableStream,
        TextDecoderStream: TextDecoderStream,
        Log: { error: function (message) { errors.push(message); } },
        document: { getElementById: function () { return null; } },
        fetch: function () {
            downloads++;
            return Promise.resolve(new Response('<tv><channel id="c1"><display-name>TV</display-name></channel></tv>'));
        },
        XmltvStore: {
            publish: function (manifest) { manifests[manifest.source] = manifest; return Promise.resolve(); },
            prune: function () { return Promise.resolve(); },
            discard: function () { return Promise.resolve(); },
            remove: function (id) { removed.push(id); return Promise.resolve(); },
            programmes: function (saved) { return Promise.resolve(manifests[saved.id] || null); },
        },
    });
    var globals = env.globals;
    var old = source({ epgUrl: 'https://guide.test/guide.xml', epgOffset: 2 });
    var updated = Object.assign({}, old, { user: 'other' });
    var accounts = {};
    accounts[globals.SourceIdentity.fingerprint(updated)] = 's2';
    env.stored['iptvnator-tv:source-accounts'] = JSON.stringify(accounts);
    await assert.rejects(globals.SourceAccount.track({ id: 's2' }, Promise.reject({ code: 'account', reason: 'login' })));
    assert.equal(globals.SourceAccount.row({ id: 's2', type: 'xtream' }, '').chip, 'Login failed');
    var saved;
    globals.SourceEdit(old, {
        openForm: function (initial, done, mode) {
            assert.equal(initial, old);
            assert.equal(mode, 'source');
            done(updated);
        },
        saved: function (change) { saved = change; },
    })();
    var guide = await globals.XmltvGuide(updated).programmes({});
    assert.equal(guide.source, 's2');
    assert.equal(downloads, 1);
    assert.equal(globals.XmltvGuide.subtitle(updated).indexOf('Guide: updated'), 0);
    assert.equal(globals.SourceAccount.row({ id: 's2', type: 'xtream' }, '').chip, 'Xtream');
    assert.equal(errors.length, 0);
    // The guide kept under the old id is not left behind.
    assert.deepEqual(removed, ['s1']);
    assert.equal(saved.source.id, 's2');
    assert.equal(saved.previousId, 's1');
    assert.equal(saved.reconnect, true);
    assert.equal(globals.Sources.current().id, 's2');
});
