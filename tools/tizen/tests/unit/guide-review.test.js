'use strict';

// Review fixes for the guide links (#90): choosing a guide channel by its
// name, picks that no longer apply, reading only the channels asked for, and
// guide settings in a backup.
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var load = require('./sandbox');

// Values from the sandbox come from another realm: compare them as JSON.
function same(actual, expected) { assert.equal(JSON.stringify(actual), JSON.stringify(expected)); }

// An IndexedDB stand-in for the guide store: get by key, getAll by key range.
function fakeIndexedDb(records) {
    var ranges = [];
    function rank(value) { return Array.isArray(value) ? 2 : typeof value === 'string' ? 1 : 0; }
    function compare(a, b) {
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        if (!Array.isArray(a)) return a < b ? -1 : a > b ? 1 : 0;
        for (var i = 0; i < Math.min(a.length, b.length); i++) {
            var step = compare(a[i], b[i]);
            if (step) return step;
        }
        return a.length - b.length;
    }
    function inside(key, range) {
        var low = compare(key, range.lower);
        var high = compare(key, range.upper);
        return (range.lowerOpen ? low > 0 : low >= 0) && (range.upperOpen ? high < 0 : high <= 0);
    }
    function answer(result) {
        var request = {};
        setTimeout(function () { request.result = result; request.onsuccess(); });
        return request;
    }
    var db = {
        transaction: function () {
            return { objectStore: function () {
                return {
                    get: function (id) { return answer(records.sources.filter(function (saved) { return saved.source === id; })[0]); },
                    getAll: function (range) {
                        ranges.push(range);
                        return answer(records.programmes.filter(function (p) { return inside([p.source, p.generation, p.channel, p.sequence], range); }));
                    },
                };
            } };
        },
    };
    return {
        ranges: ranges,
        indexedDB: { open: function () { var request = {}; setTimeout(function () { request.result = db; request.onsuccess(); }); return request; } },
        IDBKeyRange: { bound: function (lower, upper, lowerOpen, upperOpen) { return { lower: lower, upper: upper, lowerOpen: !!lowerOpen, upperOpen: !!upperOpen }; } },
    };
}

function index(channels) {
    var built = { ids: {}, names: {}, labels: {} };
    channels.forEach(function (channel) {
        var id = channel[0].toLowerCase();
        built.ids[id] = id;
        built.labels[id] = [channel[0], channel[1]];
    });
    return built;
}

var SOURCE = { id: 's1', type: 'xtream', epgUrl: 'https://guide.test/one.xml', epgUrl2: 'https://guide.test/two.xml' };

function store(sources, picks, extraManifests) {
    var programmes = [
        { source: 's1', generation: 'g1', channel: 'one.tv', sequence: 0, title: 'From guide 1', start: 0, end: 10 },
        { source: 's1', generation: 'g1', channel: 'other.tv', sequence: 1, title: 'Other', start: 0, end: 10 },
        { source: 's1#2', generation: 'g2', channel: 'two.tv', sequence: 0, title: 'From guide 2', start: 0, end: 10 },
    ];
    var manifests = [
        { source: 's1', generation: 'g1', index: index([['One.TV', 'Channel 1 (cat all)'], ['Other.TV', 'Other']]) },
        { source: 's1#2', generation: 'g2', index: index([['Two.TV', 'Channel 1 (cat all)']]) },
    ].concat(extraManifests || []);
    var idb = fakeIndexedDb({ sources: manifests, programmes: programmes });
    var stored = {};
    if (picks) stored['iptvnator-tv:guide-pick:s1'] = JSON.stringify(picks);
    var env = load(['xmltv-parser.js', 'xmltv-store.js', 'guide-pick.js'], stored, {
        indexedDB: idb.indexedDB,
        IDBKeyRange: idb.IDBKeyRange,
        Sources: { all: function () { return sources; } },
        XmltvGuide: { touch: function () {} },
    });
    // The name index: "Channel 1 (cat all)" pairs with guide 1 by name.
    manifests[0].index.names[env.globals.XmltvParser.normalName('Channel 1 (cat all)')] = 'one.tv';
    return { g: env.globals, ranges: idb.ranges, stored: env.stored };
}

var CHANNEL = { stream_id: 1, name: 'Channel 1 (cat all)' };
var link = function (n) { return { id: n === 1 ? 's1' : 's1#' + n, owner: 's1', n: n }; };

test('the guide channel list ranks guide channels by their names, not only their ids, and shows "Name (id)"', async function () {
    var env = store([SOURCE]);
    var entries = await env.g.XmltvStore.channels(link(1));
    same(entries.map(function (entry) { return [entry.id, entry.label, entry.name]; }), [['one.tv', 'One.TV', 'Channel 1 (cat all)'], ['other.tv', 'Other.TV', 'Other']]);
    var ranked = env.g.GuidePick.rank('Channel 1 (cat all)', entries.map(function (entry) { return Object.assign({ n: 1 }, entry); }));
    assert.equal(ranked[0].id, 'one.tv');
});

test('a guide saved before names were kept lists its ids alone', async function () {
    var env = store([SOURCE], null, [{ source: 's1#3', generation: 'g3', index: { ids: { 'x.tv': 'x.tv' }, names: {} } }]);
    var entries = await env.g.XmltvStore.channels({ id: 's1#3', owner: 's1', n: 3 });
    same(entries.map(function (entry) { return [entry.id, entry.label, entry.name]; }), [['x.tv', 'x.tv', '']]);
});

test('a pick from a guide link the source no longer has is ignored: the channel pairs by name again', async function () {
    var env = store([{ id: 's1', type: 'xtream', epgUrl: SOURCE.epgUrl }], { 'id:1': { n: 2, id: 'two.tv' } });
    var list = await env.g.XmltvStore.programmes(link(1), CHANNEL);
    assert.equal(list[0].title, 'From guide 1');
    assert.equal(env.g.GuidePick.option({ id: 's1', type: 'xtream', epgUrl: SOURCE.epgUrl }, CHANNEL)[0].label, 'Guide channel: Automatic');
});

test('a pick its guide no longer lists is ignored; a pick that still holds wins over pairing by name', async function () {
    var gone = store([SOURCE], { 'id:1': { n: 2, id: 'missing.tv' } });
    assert.equal((await gone.g.XmltvStore.programmes(link(1), CHANNEL))[0].title, 'From guide 1');
    var held = store([SOURCE], { 'id:1': { n: 2, id: 'two.tv' } });
    assert.equal(await held.g.XmltvStore.programmes(link(1), CHANNEL), null);
    assert.equal((await held.g.XmltvStore.programmes(link(2), CHANNEL))[0].title, 'From guide 2');
});

test('the saved-guide snapshot reads only the channels asked for, never a whole guide', async function () {
    var env = store([SOURCE]);
    var schedules = await env.g.XmltvStore.cached(link(1), [CHANNEL, { stream_id: 9, name: 'Nothing like it' }]);
    assert.equal(schedules[0][0].title, 'From guide 1');
    assert.equal(schedules[1].length, 0);
    assert.equal(env.ranges.length, 1);
    same(env.ranges[0].lower, ['s1', 'g1', 'one.tv']);
});

test('the snapshot asks each later guide only for the channels still without programmes, one guide after another', async function () {
    var asked = [];
    var env = load(['guide-data.js'], {}, {
        XmltvGuide: function () { return { programmes: function () { return Promise.resolve(null); } }; },
        XmltvStore: { cached: function (link, channels) {
            asked.push(link.n + ':' + channels.map(function (channel) { return channel.name; }).join(','));
            return Promise.resolve(link.n === 1 ? { 0: [{ title: 'A', start: 0, end: 1 }] } : {});
        } },
    });
    var data = env.globals.GuideData({ id: 's1', type: 'xtream', epgUrl: 'https://guide.test/1', epgUrl2: 'https://guide.test/2' }, {});
    var shown = await data.cached([{ stream_id: 1, name: 'One' }, { stream_id: 2, name: 'Two' }], null);
    assert.deepEqual(asked, ['1:One,Two', '2:Two']);
    assert.equal(shown[0].programmes[0].title, 'A');
});

test('picks go with a guide link that is removed or pointed at another guide, and follow a source to a new id', function () {
    var picks = { 'id:1': { n: 1, id: 'a' }, 'id:2': { n: 2, id: 'b' }, 'id:3': { n: 3, id: 'c' } };
    var removed = [];
    var env = load(['guide-pick.js', 'source-edit.js'], { 'iptvnator-tv:guide-pick:s1': JSON.stringify(picks) }, {
        Sources: { rekey: function () {} },
        SourceAccount: { forget: function () {} },
        XmltvGuide: { remove: function (id) { removed.push(id); }, refresh: function () {}, touch: function () {} },
    });
    var g = env.globals;
    var old = { id: 's1', type: 'xtream', epgUrl: 'https://g.test/1', epgUrl2: 'https://g.test/2', epgUrl3: 'https://g.test/3' };
    g.SourceEdit.commit(old, Object.assign({}, old, { epgUrl: 'https://g.test/other', epgUrl2: '', epgOffset: undefined }));
    same(Object.keys(g.GuidePick.all('s1')), ['id:3']);
    g.SourceEdit.commit(Object.assign({}, old, { epgUrl: 'https://g.test/other', epgUrl2: '' }), Object.assign({}, old, { id: 's9', epgUrl: 'https://g.test/other', epgUrl2: '' }));
    same(Object.keys(g.GuidePick.all('s9')), ['id:3']);
    same(g.GuidePick.all('s1'), {});
});

test('reading picks parses the saved record once per turn, not once per channel', function () {
    var parses = 0;
    var json = { parse: function (text) { parses++; return JSON.parse(text); }, stringify: JSON.stringify };
    var env = load(['guide-pick.js'], { 'iptvnator-tv:guide-pick:s1': JSON.stringify({ 'id:1': { n: 1, id: 'a' } }) }, { JSON: json });
    for (var i = 0; i < 50; i++) env.globals.GuidePick.get('s1', { stream_id: i });
    assert.equal(parses, 1);
});

test('Arabic has the guide form, guide menus, source options and Sources rows', function () {
    var env = load(['i18n/ar.js']);
    var ar = env.globals.I18n.tables.ar;
    ['guide.link', 'guide.refresh', 'guide.remove', 'guide.showAll', 'form.guideLink', 'form.guideHint', 'form.guideTitle', 'form.guideOffset',
        'form.preferGuide', 'form.providerFirst', 'form.providerLast', 'sources.watch', 'sources.switch', 'sources.refresh', 'sources.edit',
        'sources.refreshNow', 'sources.addXtream', 'account.expires', 'account.expiresRow', 'guide.updated', 'guide.updating'].forEach(function (key) {
        assert.ok(ar[key], 'ar lacks ' + key);
    });
});

test('the guide form names link 1 like links 2 and 3, says once what the links are, and says where the provider\'s guide goes', function () {
    var html = fs.readFileSync(path.join(__dirname, '../../tv-app/index.html'), 'utf8');
    var en = load([]).globals.I18n.tables.en;
    assert.equal(en['form.guideLink'], 'Guide link 1 (optional)');
    assert.match(html, /id="form-guide-hint" data-i18n="form.guideHint"/);
    assert.match(html, /<option value="yes" data-i18n="form.providerLast">/);
    assert.match(html, /<option value="no" data-i18n="form.providerFirst">/);
});
