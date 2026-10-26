'use strict';

// Builds tv-app/js/i18n/<code>.js from the desktop app's translation files.
//
//   node tests/i18n/build-tables.js          (from tools/tizen)
//
// A TV key takes the desktop translation only when the desktop's English text
// has the same meaning: an exact match (ignoring a leading symbol, a trailing
// "...", colon or full stop, and {{param}} names), or a key listed in MANUAL
// below after a person checked the meaning. Everything else is left out
// of the language's table, so the TV shows English (the fallback) rather than
// an invented translation. English (tv-app/js/i18n/en.js) is the source of keys.

var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

var root = path.join(__dirname, '../..');
var desktop = path.join(root, '../../apps/web/src/assets/i18n');
var out = path.join(root, 'tv-app/js/i18n');

// TV key -> desktop key, for meanings the exact-text match cannot see.
var MANUAL = {
    'settings.startUp': 'SETTINGS.CARD_STARTUP',
    'settings.relock': 'SETTINGS.PARENTAL_LOCK.RELOCK',
    'settings.theme': 'SETTINGS.THEME',
};

// Matched by text but not by meaning (the desktop's wording serves another place).
var SKIP = { 'epg.next': true, 'account.unknown': true, 'browser.sort': true };

function flat(object, prefix, into) {
    Object.keys(object).forEach(function (key) {
        var value = object[key];
        if (value && typeof value === 'object') flat(value, prefix + key + '.', into);
        else into[prefix + key] = value;
    });
    return into;
}

function load(code) {
    return flat(JSON.parse(fs.readFileSync(path.join(desktop, code + '.json'), 'utf8')), '', {});
}

function tvEnglish() {
    var sandbox = { I18n: { tables: {} } };
    vm.runInNewContext(fs.readFileSync(path.join(out, 'en.js'), 'utf8'), sandbox);
    return sandbox.I18n.tables.en;
}

function names(text, pattern) {
    return (String(text).match(pattern) || []).map(function (match) { return match.replace(/[{}\s]/g, ''); });
}

function normal(text) {
    return String(text)
        .replace(/\{\{\s*\w+\s*\}\}/g, '{}').replace(/\{\w+\}/g, '{}')
        .replace(/^[^A-Za-z{]+/, '').replace(/[….:!?\s]+$/g, '').replace(/\s+/g, ' ').trim();
}

function firstLetterCase(text) {
    var letter = normal(text).charAt(0);
    return letter === letter.toUpperCase() ? 'upper' : 'lower';
}

// The desktop key whose English text means the same as `text`, or undefined.
function find(text, desktopEnglish, index) {
    var candidates = index[normal(text).toLowerCase()] || [];
    var exact = candidates.filter(function (key) { return normal(desktopEnglish[key]) === normal(text); });
    var same = candidates.filter(function (key) { return firstLetterCase(desktopEnglish[key]) === firstLetterCase(text); });
    return exact[0] || same[0];
}

// Brings the desktop wording into the TV's conventions: {name} params in my
// order of names, my leading symbol, trailing ellipsis and colon, all caps.
function adapt(english, desktopEnglishText, translated) {
    var mine = names(english, /\{\w+\}/g);
    var theirs = names(desktopEnglishText, /\{\{\s*\w+\s*\}\}/g);
    if (mine.length !== theirs.length) return null;
    var text = String(translated).replace(/\{\{\s*(\w+)\s*\}\}/g, function (whole, name) {
        var at = theirs.indexOf(name);
        return at < 0 ? whole : '{' + mine[at] + '}';
    });
    if (/\{\{|<|>/.test(text) || !text.trim()) return null;
    var symbols = (english.match(/^[^A-Za-z{]+/) || [''])[0];
    if (symbols && !/^[^A-Za-z{]/.test(desktopEnglishText)) text = symbols + text;
    if (/…$/.test(english) && !/(…|\.\.\.)$/.test(desktopEnglishText)) text += '…';
    else if (/(…|\.\.\.)$/.test(desktopEnglishText)) text = text.replace(/\.\.\.$/, '…');
    if (/:$/.test(english) && !/[:：]$/.test(text)) text += ':';
    if (/^[A-Z]{2,}$/.test(english)) text = text.toLocaleUpperCase();
    return text;
}

function literal(text) {
    return "'" + text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
}

var english = tvEnglish();
var desktopEnglish = load('en');
var index = {};
Object.keys(desktopEnglish).forEach(function (key) {
    var normalized = normal(desktopEnglish[key]).toLowerCase();
    if (normalized.length >= 2) (index[normalized] = index[normalized] || []).push(key);
});

var mapping = {};
Object.keys(english).forEach(function (key) {
    if (SKIP[key]) return;
    var found = MANUAL[key] || find(english[key], desktopEnglish, index);
    if (found) mapping[key] = found;
});

var report = [];
fs.readdirSync(desktop).map(function (name) { return name.replace('.json', ''); }).sort().forEach(function (code) {
    if (code === 'en') return;
    var table = load(code);
    var lines = [];
    Object.keys(english).sort().forEach(function (key) {
        var source = mapping[key];
        if (!source || table[source] === undefined) return;
        var text = adapt(english[key], desktopEnglish[source], table[source]);
        if (text !== null) lines.push('    ' + literal(key) + ': ' + literal(text) + ',');
    });
    var header = '// Generated by tests/i18n/build-tables.js from apps/web/src/assets/i18n/' + code + '.json.\n' +
        '// Only keys whose desktop English text means the same are here; the rest fall back to English.\n';
    fs.writeFileSync(path.join(out, code + '.js'), header + 'I18n.tables.' + code + ' = {\n' + lines.join('\n') + '\n};\n');
    report.push(code + ': ' + lines.length + ' translated, ' + (Object.keys(english).length - lines.length) + ' fall back to English');
});
console.log(Object.keys(english).length + ' keys in English');
console.log(report.join('\n'));
