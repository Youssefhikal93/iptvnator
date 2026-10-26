'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var sandbox = require('./sandbox');

var appDir = path.join(__dirname, '../../tv-app');
var jsDir = path.join(appDir, 'js');
var tableFiles = fs.readdirSync(path.join(jsDir, 'i18n')).filter(function (name) { return /\.js$/.test(name); });

// A fresh I18n with English and any extra tables the test supplies.
function load(extra) {
    var env = sandbox([]);
    var I18n = env.globals.I18n;
    Object.keys(extra || {}).forEach(function (code) { I18n.tables[code] = extra[code]; });
    return I18n;
}

function params(text) {
    return (String(text).match(/\{\w+\}/g) || []).sort().join(',');
}

test('t fills {name} placeholders and leaves unknown ones visible', function () {
    var I18n = load({});
    I18n.tables.en['spec.hello'] = 'Hello {name}, you have {n} items';
    assert.equal(I18n.t('spec.hello', { name: 'Ada', n: 3 }), 'Hello Ada, you have 3 items');
    assert.equal(I18n.t('spec.hello', { name: 'Ada' }), 'Hello Ada, you have {n} items');
    assert.equal(I18n.t('spec.hello'), 'Hello {name}, you have {n} items');
    assert.equal(I18n.t('spec.hello', { name: 0, n: '' }), 'Hello 0, you have  items');
});

test('a key missing from the chosen language falls back to English; an unknown key shows itself', function () {
    var I18n = load({ de: { 'rail.home': 'Startseite' } });
    I18n.tables.en['spec.onlyEnglish'] = 'Only in English';
    I18n.setLanguage('de');
    assert.equal(I18n.t('rail.home'), 'Startseite');
    assert.equal(I18n.t('spec.onlyEnglish'), 'Only in English');
    assert.equal(I18n.t('spec.nowhere'), 'spec.nowhere');
    I18n.setLanguage('en');
    assert.equal(I18n.t('rail.home'), 'Home');
});

test('plural forms follow the language rules and fall back to English forms', function () {
    var I18n = load({
        ru: { 'spec.items.one': '{count} predmet', 'spec.items.few': '{count} predmeta', 'spec.items.many': '{count} predmetov', 'spec.items.other': '{count} predmeta*' },
        de: {},
    });
    I18n.tables.en['spec.items.one'] = '{count} item';
    I18n.tables.en['spec.items.other'] = '{count} items';
    assert.equal(I18n.t('spec.items', { count: 1 }), '1 item');
    assert.equal(I18n.t('spec.items', { count: 0 }), '0 items');
    assert.equal(I18n.t('spec.items', { count: 5 }), '5 items');
    I18n.setLanguage('ru');
    assert.equal(I18n.t('spec.items', { count: 1 }), '1 predmet');
    assert.equal(I18n.t('spec.items', { count: 3 }), '3 predmeta');
    assert.equal(I18n.t('spec.items', { count: 5 }), '5 predmetov');
    assert.equal(I18n.t('spec.items', { count: 21 }), '21 predmet');
    // A language without the forms uses English's, with English's own rules.
    I18n.setLanguage('de');
    assert.equal(I18n.t('spec.items', { count: 1 }), '1 item');
    assert.equal(I18n.t('spec.items', { count: 2 }), '2 items');
});

test('a plain key still works when count is a param', function () {
    var I18n = load({});
    I18n.tables.en['spec.total'] = 'Total: {count}';
    assert.equal(I18n.t('spec.total', { count: 4 }), 'Total: 4');
});

test('setLanguage ignores unknown codes, announces real changes once and exposes the locale', function () {
    var I18n = load({ de: { 'rail.home': 'Startseite' }, zhtw: {} });
    var seen = [];
    I18n.onChange(function (code) { seen.push(code); });
    assert.equal(I18n.language(), 'en');
    assert.equal(I18n.setLanguage('xx'), 'en');
    assert.equal(I18n.setLanguage('de'), 'de');
    assert.equal(I18n.setLanguage('de'), 'de');
    assert.equal(I18n.locale(), 'de');
    I18n.setLanguage('zhtw');
    assert.equal(I18n.locale(), 'zh-TW');
    I18n.setLanguage('en');
    assert.equal(seen.join(','), 'de,zhtw,en');
});

test('languages lists loaded tables by their own names, English first', function () {
    var I18n = load({ de: {}, ja: {} });
    var names = I18n.languages().map(function (language) { return language.code + ':' + language.name; });
    assert.equal(names.join('|'), 'en:English|de:Deutsch|ja:日本語');
});

test('time is a 24-hour clock and date follows the language', function () {
    var I18n = load({ de: {} });
    var when = new Date(2026, 2, 4, 7, 5).getTime();
    assert.equal(I18n.time(when), '07:05');
    var evening = new Date(2026, 2, 4, 0, 5).getTime();
    assert.equal(I18n.time(evening), '00:05');
    I18n.setLanguage('de');
    assert.match(I18n.date(when, { month: 'long' }), /März/);
});

test('categoryName translates the saved "All channels" row by its empty id only', function () {
    var I18n = load({ de: { 'browser.allChannels': 'Alle Sender' } });
    I18n.setLanguage('de');
    assert.equal(I18n.categoryName({ category_id: '', category_name: 'All channels' }), 'Alle Sender');
    assert.equal(I18n.categoryName({ category_id: '7', category_name: 'All channels' }), 'All channels');
    assert.equal(I18n.categoryName({ category_name: 'Sources' }), 'Sources');
});

// ---- The tables themselves ----

function english() {
    return load({}).tables.en;
}

test('every language table only uses keys English has, with the same placeholders', function () {
    var en = english();
    tableFiles.filter(function (name) { return name !== 'en.js'; }).forEach(function (name) {
        var code = name.replace('.js', '');
        var table = sandbox(['i18n/' + name]).globals.I18n.tables[code];
        assert.ok(Object.keys(table).length > 50, code + ' has translations');
        Object.keys(table).forEach(function (key) {
            assert.ok(en[key] !== undefined, code + ' has an unknown key ' + key);
            assert.equal(params(table[key]), params(en[key]), code + ' ' + key + ' placeholders');
            assert.ok(!/\{\{|<|>/.test(table[key]), code + ' ' + key + ' has no markup');
        });
    });
});

test('every desktop translation file has a table and index.html loads it', function () {
    var desktop = path.join(__dirname, '../../../../apps/web/src/assets/i18n');
    var html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
    fs.readdirSync(desktop).filter(function (name) { return /\.json$/.test(name); }).forEach(function (name) {
        var code = name.replace('.json', '');
        assert.ok(fs.existsSync(path.join(jsDir, 'i18n', code + '.js')), code + ' table exists');
        assert.ok(html.indexOf('src="js/i18n/' + code + '.js"') > 0, code + ' is loaded');
    });
});

function sources() {
    return fs.readdirSync(jsDir).filter(function (name) { return /\.js$/.test(name); }).map(function (name) {
        return fs.readFileSync(path.join(jsDir, name), 'utf8');
    });
}

test('every key the code or index.html asks for exists in English', function () {
    var en = english();
    var asked = [];
    sources().forEach(function (text) {
        var pattern = /I18n\.t\(\s*(?:[^'()]*\?\s*)?'([A-Za-z0-9.]+)'(?:\s*:\s*'([A-Za-z0-9.]+)')?/g;
        var match;
        while ((match = pattern.exec(text))) asked.push(match[1], match[2]);
    });
    var html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
    var attribute = /data-i18n(?:-title|-label|-placeholder)?="([^"]+)"/g;
    var found;
    while ((found = attribute.exec(html))) asked.push(found[1]);
    // Keys built from a prefix ('backup.' + mode) are covered by the unused-key check.
    asked.filter(function (key) { return key && !/\.$/.test(key); }).forEach(function (key) {
        var plural = en[key + '.other'] !== undefined;
        assert.ok(en[key] !== undefined || plural, 'English lacks ' + key);
    });
});

test('English has no key that nothing uses', function () {
    var en = english();
    var text = sources().join('\n') + fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
    var literals = {};
    (text.match(/['"][A-Za-z0-9.]+['"]/g) || []).forEach(function (quoted) { literals[quoted.slice(1, -1)] = true; });
    var prefixes = Object.keys(literals).filter(function (literal) { return literal.length >= 6 && /^[a-z]+\.[A-Za-z.]*$/.test(literal) && en[literal] === undefined; });
    var unused = Object.keys(en).filter(function (key) {
        if (literals[key]) return false;
        return !prefixes.some(function (prefix) { return key.indexOf(prefix) === 0; });
    });
    assert.equal(unused.join(', '), '');
});
