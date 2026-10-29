'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var load = require('./sandbox');

function appearance(stored) {
    var attributes = {};
    var app = load(['profile-store.js', 'settings-store.js', 'i18n/de.js', 'appearance.js', 'appearance-settings.js'], stored, {
        document: {
            documentElement: { setAttribute: function (name, text) { attributes[name] = text; } },
            querySelectorAll: function () { return []; },
        },
    });
    app.attributes = attributes;
    return app;
}

function assertAppearance(app, theme, accent, density) {
    assert.equal(app.attributes['data-theme'], theme);
    assert.equal(app.attributes['data-accent'], accent);
    assert.equal(app.attributes['data-density'], density);
}

test('fresh and unknown stored appearance choices apply dark, blue and comfortable without rewriting storage', function () {
    [undefined, { theme: 'unknown', accent: '__proto__', density: 'tiny' }].forEach(function (settings) {
        var stored = settings ? { 'iptvnator-tv:p:default:settings': JSON.stringify(settings) } : {};
        var app = appearance(stored);
        assertAppearance(app, 'dark', 'blue', 'comfortable');
        assert.equal(app.stored['iptvnator-tv:p:default:settings'], stored['iptvnator-tv:p:default:settings']);
        assert.equal(app.globals.Prefs.getDefault('theme'), 'dark');
        assert.equal(app.globals.Prefs.getDefault('accent'), 'blue');
        assert.equal(app.globals.Prefs.getDefault('density'), 'comfortable');
    });
});

test('a profile that chose the dropped Moroccan Arabic is moved to Arabic and keeps its other settings', function () {
    var app = appearance({ 'iptvnator-tv:p:default:settings': JSON.stringify({ language: 'ary', theme: 'light' }) });
    assert.equal(app.globals.Prefs.get('language'), 'ar');
    assert.deepEqual(JSON.parse(app.stored['iptvnator-tv:p:default:settings']), { language: 'ar', theme: 'light' });
    assert.equal(app.attributes['data-theme'], 'light');
});

test('all four stored themes apply on startup and Prefs changes without rewriting saved values', function () {
    ['dark', 'black', 'grey', 'light', 'unknown'].forEach(function (theme) {
        var stored = { 'iptvnator-tv:p:default:settings': JSON.stringify({ theme: theme }) };
        var app = appearance(stored);
        var expected = theme === 'unknown' ? 'dark' : theme;
        assert.equal(app.attributes['data-theme'], expected);
        assert.equal(app.stored['iptvnator-tv:p:default:settings'], stored['iptvnator-tv:p:default:settings']);
        app.globals.Prefs.set('theme', theme === 'light' ? 'dark' : 'light');
        app.globals.Prefs.set('theme', theme);
        assert.equal(app.attributes['data-theme'], expected);
    });
});

test('stored appearance applies on startup and Prefs changes immediately update every appearance attribute and language', function () {
    var app = appearance({ 'iptvnator-tv:p:default:settings': JSON.stringify({ theme: 'light', accent: 'pink', density: 'compact' }) });
    assertAppearance(app, 'light', 'pink', 'compact');
    var prefs = app.globals.Prefs;
    ['blue', 'saffron', 'asphalt', 'violet', 'pink'].forEach(function (accent) {
        prefs.set('accent', accent);
        assertAppearance(app, 'light', accent, 'compact');
    });
    prefs.set('theme', 'dark');
    prefs.set('density', 'comfortable');
    prefs.set('language', 'de');
    assertAppearance(app, 'dark', 'pink', 'comfortable');
    assert.equal(app.globals.I18n.language(), 'de');
    prefs.set('theme', 'bad');
    prefs.set('accent', null);
    prefs.set('density', false);
    assertAppearance(app, 'dark', 'blue', 'comfortable');
});

test('appearance choices persist separately for each profile and switch with it', function () {
    var app = appearance();
    var profiles = app.globals.ProfileStore;
    var prefs = app.globals.Prefs;
    prefs.set('theme', 'light');
    prefs.set('accent', 'saffron');
    prefs.set('density', 'compact');
    var other = profiles.add('Other');
    profiles.setActive(other.id);
    assertAppearance(app, 'dark', 'blue', 'comfortable');
    prefs.set('theme', 'grey');
    prefs.set('accent', 'violet');
    profiles.setActive('default');
    assertAppearance(app, 'light', 'saffron', 'compact');
    profiles.setActive(other.id);
    assertAppearance(app, 'grey', 'violet', 'comfortable');
    var restarted = appearance(app.stored);
    assertAppearance(restarted, 'grey', 'violet', 'comfortable');
});

test('Appearance rows expose translated choices in every language table', function () {
    var files = fs.readdirSync(path.join(__dirname, '../../tv-app/js/i18n')).filter(function (file) { return /\.js$/.test(file) && file !== 'en.js'; });
    var app = load(['settings-store.js'].concat(files.map(function (file) { return 'i18n/' + file; }), ['appearance-settings.js']));
    var rows = app.globals.AppearanceSettings.rows;
    assert.equal(rows.map(function (row) { return row.key || 'language'; }).join(','), 'language,theme,accent,density,motion,topBar,menuPosition');
    Object.keys(app.globals.I18n.tables).forEach(function (code) {
        app.globals.I18n.setLanguage(code);
        rows.slice(2).forEach(function (row) {
            assert.ok(app.globals.I18n.tables[code]['settings.' + row.key], code + ' labels ' + row.key);
            assert.equal(row.labels.length, row.choices.length);
            row.choices.forEach(function (choice, index) {
                assert.equal(row.labels[index], app.globals.I18n.tables[code]['settings.' + choice]);
                assert.ok(row.labels[index] && !/\?/.test(row.labels[index]), code + ' translates ' + choice);
            });
        });
    });
});
