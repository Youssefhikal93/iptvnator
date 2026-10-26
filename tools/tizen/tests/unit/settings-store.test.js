'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var SETTINGS = 'iptvnator-tv:settings';
var VIEW = 'iptvnator-tv:view:movies';

test('legacy startup choices are read without migration and explicit onStart remains authoritative', function () {
    [
        [{ lastChannelOnStart: false }, 'home'],
        [{ lastChannelOnStart: true }, 'last-channel'],
        [{ lastChannelOnStart: false, onStart: 'last-channel' }, 'last-channel'],
    ].forEach(function (scenario) {
        var stored = {};
        stored[SETTINGS] = JSON.stringify(scenario[0]);
        var app = load(['settings-store.js'], stored);
        assert.equal(app.globals.Prefs.get('onStart'), scenario[1]);
        assert.equal(app.globals.Prefs.get('lastChannelOnStart'), scenario[1] === 'last-channel');
        assert.equal(app.stored[SETTINGS], stored[SETTINGS]);
    });
});

test('settings object wins conflicting view keys and older bare choices remain readable', function () {
    var stored = {};
    stored[VIEW] = 'list';
    var app = load(['settings-store.js', 'library.js'], stored);
    assert.equal(app.globals.Library.view('movies'), 'list');
    app.stored[SETTINGS] = JSON.stringify({ 'view:movies': 'grid' });
    assert.equal(app.globals.Prefs.get('view:movies'), 'grid');
    assert.equal(app.globals.Library.view('movies'), 'grid');
    var changes = [];
    app.globals.Prefs.onChange(function (name) {
        changes.push(name);
        assert.equal(app.stored[VIEW], 'list');
        assert.equal(JSON.parse(app.stored[SETTINGS])['view:movies'], 'list');
    });
    app.globals.Library.setView('movies', 'list');
    assert.deepEqual(changes, ['view:movies']);
});

test('defaults survive absent, malformed or unavailable storage', function () {
    [undefined, '{bad json'].forEach(function (settings) {
        var stored = {};
        if (settings !== undefined) stored[SETTINGS] = settings;
        var prefs = load(['settings-store.js'], stored).globals.Prefs;
        assert.equal(prefs.get('onStart'), 'last-channel');
        assert.equal(prefs.get('autoplayMs'), 8000);
        assert.equal(prefs.get('programmeGuide'), true);
        assert.equal(prefs.get('homeLayout'), 'cinema');
        assert.equal(prefs.get('view:movies'), 'grid');
        assert.equal(prefs.get('view:live'), 'list');
        assert.equal(prefs.get('sort:series'), 'newest');
    });
    var prefs = load(['settings-store.js'], {}, {
        localStorage: { getItem: function () { throw new Error('unavailable'); } },
    }).globals.Prefs;
    assert.equal(prefs.get('view:movies'), 'grid');
});

test('legacy startup writes notify subscribers using the canonical name and retain unrelated settings', function () {
    var stored = {};
    stored[SETTINGS] = JSON.stringify({ homeLayout: 'showcase' });
    var app = load(['settings-store.js'], stored);
    var changes = [];
    app.globals.Prefs.onChange(function (name) { changes.push(name); });
    app.globals.Prefs.set('lastChannelOnStart', false);
    assert.equal(app.globals.Prefs.get('onStart'), 'home');
    assert.deepEqual(changes, ['onStart']);
    assert.deepEqual(JSON.parse(app.stored[SETTINGS]), { homeLayout: 'showcase', onStart: 'home' });
});
