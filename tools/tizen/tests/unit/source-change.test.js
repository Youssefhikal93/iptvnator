'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

var XTREAM = { id: 's1', type: 'xtream', name: 'Living room', url: 'https://example.test', user: 'viewer', pass: 'secret', epgUrl: 'https://guide.test/a.xml', epgOffset: 0 };
var M3U = { id: 'm1', type: 'm3u', name: 'Playlist', url: 'https://lists.test/a.m3u', epgUrl: '', epgOffset: 0 };

// Real stores and identity; the guide and the account bookkeeping only record what they are asked.
function app(sources) {
    var calls = [];
    var env = load(['sources.js', 'source-identity.js', 'source-guide.js', 'source-edit.js'], {
        'iptvnator-tv:sources': JSON.stringify(sources),
        'iptvnator-tv:current': JSON.stringify(sources[0].id),
    }, {
        URL: URL,
        Date: { now: function () { return 100; } },
        Log: { error: function (message) { throw new Error(message); } },
        SourceAccount: { forget: function (id) { calls.push(['forget', id]); } },
        XmltvGuide: {
            refresh: function (source) { calls.push(['refresh', source.id]); },
            remove: function (id) { calls.push(['remove', id]); },
        },
    });
    env.calls = calls;
    return env;
}

// Runs the source edit with the form answering `changes` and reports what it handed back.
function edit(env, source, changes) {
    var saved;
    env.globals.SourceEdit(source, {
        openForm: function (initial, done, mode) {
            assert.equal(mode, 'source');
            done(Object.assign({}, initial, changes));
        },
        saved: function (change) { saved = change; },
    })();
    return saved;
}

function guideEdit(env, source, changes) {
    var changed;
    var options = env.globals.SourceGuide(source, {
        openForm: function (initial, done) { done(Object.assign({}, initial, changes)); },
        changed: function (updated) { changed = updated; },
    });
    options[0].run();
    return changed;
}

test('an unrelated edit reconnects nothing and leaves the guide alone', function () {
    var env = app([XTREAM]);
    var saved = edit(env, XTREAM, { name: 'Bedroom' });
    assert.equal(saved.source.id, 's1');
    assert.equal(saved.reconnect, false);
    assert.equal(saved.rekeyed, false);
    assert.equal(saved.previousId, 's1');
    assert.deepEqual(env.calls, []);
    assert.equal(env.globals.Sources.all()[0].name, 'Bedroom');
});

test('a blank name falls back to the host name', function () {
    var env = app([XTREAM]);
    assert.equal(edit(env, XTREAM, { name: '  ' }).source.name, 'example.test');
});

test('a password-only change reconnects but keeps the source account', function () {
    var env = app([XTREAM]);
    var saved = edit(env, XTREAM, { pass: 'replacement' });
    assert.equal(saved.source.id, 's1');
    assert.equal(saved.reconnect, true);
    assert.equal(saved.rekeyed, false);
    assert.deepEqual(env.calls, [['forget', 's1']]);
});

test('another username is another source account with a fresh id', function () {
    var env = app([XTREAM]);
    var saved = edit(env, XTREAM, { user: 'other' });
    assert.equal(saved.source.id, 's100');
    assert.equal(saved.reconnect, true);
    assert.equal(saved.rekeyed, true);
    assert.equal(saved.previousId, 's1');
    // The guide stored under the old id goes; the new id downloads its own.
    assert.deepEqual(env.calls, [['forget', 's100'], ['remove', 's1'], ['refresh', 's100']]);
    assert.equal(env.globals.Sources.all()[0].id, 's100');
    assert.equal(env.globals.Sources.current().id, 's100');
});

test('another server is another source account', function () {
    var env = app([XTREAM]);
    var saved = edit(env, XTREAM, { url: 'https://elsewhere.test' });
    assert.equal(saved.source.id, 's100');
    assert.equal(saved.reconnect, true);
});

test('another M3U link is another source account', function () {
    var env = app([M3U]);
    var saved = edit(env, M3U, { url: 'https://lists.test/b.m3u' });
    assert.equal(saved.source.id, 's100');
    assert.equal(saved.reconnect, true);
    assert.equal(saved.previousId, 'm1');
    // The new link has no guide address, so nothing is downloaded, and the old guide does not linger.
    assert.deepEqual(env.calls, [['forget', 's100'], ['remove', 'm1'], ['remove', 's100']]);
});

test('a new guide address or offset refreshes the guide under the same id', function () {
    var env = app([XTREAM]);
    edit(env, XTREAM, { epgUrl: 'https://guide.test/b.xml' });
    edit(env, XTREAM, { epgOffset: 2 });
    assert.deepEqual(env.calls, [['refresh', 's1'], ['refresh', 's1']]);
});

test('a cleared guide address removes the guide', function () {
    var env = app([XTREAM]);
    var saved = edit(env, XTREAM, { epgUrl: '' });
    assert.equal(saved.reconnect, false);
    assert.deepEqual(env.calls, [['remove', 's1']]);
});

test('going back to an earlier account brings its id back', function () {
    var env = app([XTREAM]);
    var away = edit(env, XTREAM, { user: 'other' }).source;
    env.calls.length = 0;
    var back = edit(env, away, { user: 'viewer' });
    assert.equal(back.source.id, 's1');
    assert.equal(back.previousId, 's100');
    assert.equal(env.globals.Sources.all()[0].id, 's1');
    assert.deepEqual(env.calls, [['forget', 's1'], ['remove', 's100'], ['refresh', 's1']]);
});

test('an account saved as another source gets a fresh id', function () {
    var other = Object.assign({}, XTREAM, { id: 's2', user: 'other' });
    var env = app([XTREAM, other]);
    var saved = edit(env, XTREAM, { user: 'other' });
    assert.equal(saved.source.id, 's100');
    assert.equal(env.globals.Sources.all()[1].id, 's2');
});

test('the guide form saves in place and refreshes only when the guide changed', function () {
    var env = app([XTREAM]);
    var changed = guideEdit(env, XTREAM, { epgUrl: 'https://guide.test/b.xml' });
    assert.equal(changed.id, 's1');
    assert.deepEqual(env.calls, [['refresh', 's1']]);
    env.calls.length = 0;
    guideEdit(env, XTREAM, { epgPrefer: false });
    assert.deepEqual(env.calls, []);
    guideEdit(env, XTREAM, { epgOffset: 3 });
    assert.deepEqual(env.calls, [['refresh', 's1']]);
});

test('the guide form removes the guide when its address is cleared', function () {
    var env = app([XTREAM]);
    guideEdit(env, XTREAM, { epgUrl: '' });
    assert.deepEqual(env.calls, [['remove', 's1']]);
    assert.equal(env.globals.Sources.all()[0].epgUrl, '');
});

test('the guide menu removes the guide and clears the address', function () {
    var env = app([XTREAM]);
    var changed;
    var options = env.globals.SourceGuide(XTREAM, { openForm: function () {}, changed: function (updated) { changed = updated; } });
    options[options.length - 1].run();
    assert.equal(changed.epgUrl, '');
    assert.deepEqual(env.calls, [['remove', 's1']]);
    assert.equal(env.globals.Sources.all()[0].epgUrl, '');
});
