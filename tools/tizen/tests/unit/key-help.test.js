'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var load = require('./sandbox');

// Values from the app's own realm, compared as plain data.
function same(actual, expected, message) {
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);
}

var jsDir = path.join(__dirname, '../../tv-app/js');

function app() {
    return load(['i18n/ar.js', 'keys.js', 'key-help.js', 'guide.js', 'home.js', 'settings.js', 'browser.js', 'player-help.js']).globals;
}

// Every screen's Help, by the files whose keys it describes.
function screens(g) {
    return [
        { name: 'guide', files: ['guide.js'], help: g.TvGuide.help() },
        { name: 'home', files: ['home.js'], help: g.Home.help(true) },
        { name: 'settings', files: ['settings.js'], help: g.Settings.help() },
        { name: 'live lists', files: ['browser.js'], help: g.Browser.help('live', true) },
        { name: 'movies', files: ['browser.js'], help: g.Browser.help('movies', false) },
        { name: 'live player', files: ['app.js', 'player.js', 'channel-list.js'], help: g.PlayerHelp.help(true) },
        { name: 'film player', files: ['player.js'], help: g.PlayerHelp.help(false) },
    ];
}

function colours(g, help) {
    return help.reduce(function (all, entry) {
        return all.concat(g.KeyHelp.colours(g.I18n.t(entry[0])), g.KeyHelp.colours(g.I18n.t(entry[1])));
    }, []);
}

test('parts splits colour names into dots, colours lists them and plain names them in words', function () {
    var g = app();
    same(g.KeyHelp.parts('{yellow} / Hold OK: Start over'), [{ dot: 'yellow' }, ' / Hold OK: Start over']);
    same(g.KeyHelp.parts('A {blue}B{red}'), ['A ', { dot: 'blue' }, 'B', { dot: 'red' }]);
    same(g.KeyHelp.parts('{purple} OK'), ['{purple} OK']);
    same(g.KeyHelp.colours('PRE-CH / {green} Green and {yellow}'), ['green', 'yellow']);
    assert.equal(g.KeyHelp.plain('{blue} Search programmes'), 'Blue Search programmes');
    g.I18n.setLanguage('ar');
    assert.equal(g.KeyHelp.plain('{yellow}'), 'الأصفر');
});

test('every screen has Help made of [key, does] entries English and Arabic both name', function () {
    var g = app();
    var en = g.I18n.tables.en;
    var ar = g.I18n.tables.ar;
    screens(g).forEach(function (screen) {
        assert.ok(screen.help.length >= 3, screen.name + ' lists its keys');
        screen.help.forEach(function (entry) {
            assert.equal(entry.length, 2, screen.name + ' entry ' + entry);
            entry.forEach(function (key) {
                assert.ok(en[key] !== undefined, screen.name + ': English lacks ' + key);
                // Bare key names (OK, Return, ▲) read the same in Arabic.
                assert.ok(ar[key] !== undefined || /^help\.key\.(ok|return|up|down|upDown|upDownCh|left|leftRight|leftReturn|okRight|chUpDown)$/.test(key) || key === 'header.guide',
                    screen.name + ': Arabic lacks ' + key);
            });
        });
        assert.ok(screen.help.some(function (entry) { return /^help\.key\.(return|leftReturn)$/.test(entry[0]); }), screen.name + ' says what Return does');
    });
    assert.ok(en['help.colourKeys'].indexOf('123') >= 0 && ar['help.colourKeys'].indexOf('123') >= 0);
});

test('every coloured key a screen handles is in its Help, as a dot', function () {
    var g = app();
    var names = { RED: 'red', GREEN: 'green', YELLOW: 'yellow', BLUE: 'blue' };
    screens(g).forEach(function (screen) {
        var handled = {};
        screen.files.forEach(function (file) {
            var source = fs.readFileSync(path.join(jsDir, file), 'utf8');
            (source.match(/\bKEYS?\.(RED|GREEN|YELLOW|BLUE)\b|\bKeys\.(RED|GREEN|YELLOW|BLUE)\b/g) || []).forEach(function (use) {
                handled[names[use.split('.')[1]]] = true;
            });
        });
        // The film player's Yellow and the live player's Green and Yellow.
        var shown = colours(g, screen.help);
        Object.keys(handled).forEach(function (colour) {
            if (screen.name === 'film player' && colour !== 'yellow') return;
            assert.ok(shown.indexOf(colour) >= 0, screen.name + ' Help shows the ' + colour + ' key');
        });
    });
    same(colours(g, g.TvGuide.help()).sort(), ['blue', 'yellow']);
    same(colours(g, g.PlayerHelp.help(true)).sort(), ['green', 'yellow']);
    same(colours(g, g.Home.help(false)), []);
});

test('hint lines that name a coloured key draw it as a dot, never as a word', function () {
    var g = app();
    ['en', 'ar'].forEach(function (code) {
        g.I18n.setLanguage(code);
        [['guide.hints', ['yellow']], ['programmeSearch.shortcut', ['blue']], ['epg.watchFromStart', ['yellow']]].forEach(function (pair) {
            var text = g.I18n.t(pair[0]);
            same(g.KeyHelp.colours(text), pair[1], code + ' ' + pair[0]);
            assert.ok(!/Yellow|Blue|Green|Red|الأصفر|الأزرق|الأخضر|الأحمر/.test(text), code + ' ' + pair[0] + ' names no colour in words');
        });
    });
});

test('the live player menu offers Previous channel and Help; films offer Help', function () {
    var g = app();
    var played = [];
    g.PlayerHelp.init({ previous: function () { return { name: 'Channel 2' }; }, watchPrevious: function () { played.push('previous'); } });
    var rows = [];
    var item = function (label, active, run) { rows.push({ label: label, run: run }); };
    g.PlayerHelp.menuEntries(item, { live: true });
    same(rows.map(function (row) { return row.label; }), ['Previous channel: Channel 2', 'Help']);
    rows[0].run();
    same(played, ['previous']);
    rows = [];
    g.PlayerHelp.menuEntries(item, { live: false });
    same(rows.map(function (row) { return row.label; }), ['Help']);
    g.PlayerHelp.init({ previous: function () { return null; }, watchPrevious: function () {} });
    rows = [];
    g.PlayerHelp.menuEntries(item, { live: true });
    same(rows.map(function (row) { return row.label; }), ['Help']);
});
