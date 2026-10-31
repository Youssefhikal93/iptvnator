'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

var A = 'https://a.test/guide.xml';
var B = 'https://b.test/guide.xml.gz';
var C = 'https://c.test/guide.xml';

// Arrays from the sandbox have its own prototypes; compare their contents.
function same(actual, expected, message) {
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);
}

function links(overrides) {
    return load([], {}, Object.assign({ URL: URL }, overrides)).globals.GuideLinks;
}

test('a source saved before #90 keeps its order: provider last, or first when Prefer my guide was Off', function () {
    var GuideLinks = links();
    same(GuideLinks.order({ id: 's1', type: 'xtream', epgUrl: A }), ['1', 'provider']);
    same(GuideLinks.order({ id: 's1', type: 'xtream', epgUrl: A, epgPrefer: false }), ['provider', '1']);
    same(GuideLinks.order({ id: 's1', type: 'xtream' }), ['provider']);
    same(GuideLinks.order({ id: 'm1', type: 'm3u', epgUrl: A, epgUrl3: C }), ['1', '3']);
    same(GuideLinks.order({ id: 's1', epgUrl: A }, false), ['1']);
});

test('links are kept under the source id, then #2 and #3; an empty link is skipped', function () {
    var GuideLinks = links();
    var source = { id: 's1', type: 'xtream', epgUrl: A, epgUrl2: '  ', epgUrl3: C, epgOffset: 2 };
    same(GuideLinks.links(source).map(function (link) { return [link.id, link.n, link.owner, link.epgUrl, link.epgOffset]; }),
        [['s1', 1, 's1', A, 2], ['s1#3', 3, 's1', C, 2]]);
    same(GuideLinks.ids('s1'), ['s1', 's1#2', 's1#3']);
    assert.equal(GuideLinks.owner('s1#3'), 's1');
    assert.equal(GuideLinks.any({ id: 's1' }), false);
});

test('moving changes only the order; a link added later goes before a provider that is last', function () {
    var GuideLinks = links();
    var source = { id: 's1', type: 'xtream', epgUrl: A, epgUrl2: B };
    var moved = GuideLinks.move(source, '2', -1);
    same(GuideLinks.order(moved), ['2', '1', 'provider']);
    assert.equal(moved.epgUrl, A);
    moved = GuideLinks.move(moved, 'provider', 1);
    same(GuideLinks.order(moved), ['2', '1', 'provider'], 'a step past the ends is ignored');
    moved = GuideLinks.move(moved, 'provider', -1);
    same(GuideLinks.order(moved), ['2', 'provider', '1']);
    assert.equal(moved.epgPrefer, true);
    var top = GuideLinks.move(moved, 'provider', -1);
    same(GuideLinks.order(top), ['provider', '2', '1']);
    assert.equal(top.epgPrefer, false);
    var ordered = { id: 's1', type: 'xtream', epgUrl: A, epgOrder: ['1', 'provider'] };
    same(GuideLinks.order(Object.assign({}, ordered, { epgUrl3: C })), ['1', '3', 'provider']);
    same(GuideLinks.order(Object.assign({}, ordered, { epgOrder: ['provider', '1'], epgUrl3: C })), ['provider', '1', '3']);
});

test('the form\'s Prefer my guide puts the provider first or last and keeps the links\' order', function () {
    var GuideLinks = links();
    var source = { id: 's1', type: 'xtream', epgUrl: A, epgUrl2: B, epgOrder: ['2', 'provider', '1'] };
    same(GuideLinks.order(GuideLinks.prefer(source, false)), ['provider', '2', '1']);
    same(GuideLinks.order(GuideLinks.prefer(source, true)), ['2', '1', 'provider']);
});

test('each link is refreshed, kept or removed on its own; an empty link 2 or 3 is left alone', function () {
    var calls = [];
    var env = load(['sources.js', 'source-identity.js', 'source-edit.js'], {
        'iptvnator-tv:sources': JSON.stringify([{ id: 's1', type: 'm3u', url: 'https://x.test/a.m3u', epgUrl: A, epgUrl2: B }]),
    }, {
        URL: URL,
        Log: { error: function () {} },
        SourceAccount: { forget: function () {} },
        XmltvGuide: {
            refresh: function (link) { calls.push(['refresh', link.id, link.epgUrl]); },
            remove: function (id) { calls.push(['remove', id]); },
        },
    }).globals;
    var old = env.Sources.all()[0];
    var change = env.SourceEdit.plan(old, Object.assign({}, old, { epgUrl2: '', epgUrl3: C }));
    same(change.guides, { 1: 'keep', 2: 'remove', 3: 'refresh' });
    env.SourceEdit.commit(old, Object.assign({}, old, { epgUrl2: '', epgUrl3: C }));
    same(calls, [['remove', 's1#2'], ['refresh', 's1#3', C]]);
    calls.length = 0;
    env.SourceEdit.commit(old, Object.assign({}, old, { epgOffset: 1 }));
    same(calls, [['refresh', 's1', A], ['refresh', 's1#2', B]]);
});

test('a chosen guide channel is kept per source and channel, and Automatic forgets it', function () {
    var touched = [];
    var env = load(['xmltv-parser.js', 'guide-pick.js'], {}, {
        Log: { error: function () {} },
        XmltvGuide: { touch: function (id) { touched.push(id); } },
    }).globals;
    var channel = { stream_id: 7, name: 'beIN SP 1 HD' };
    assert.equal(env.GuidePick.get('s1', channel), null);
    env.GuidePick.set('s1', channel, { n: 2, id: 'beIN SPORTS 1.qa' });
    same(env.GuidePick.get('s1', channel), { n: 2, id: 'beIN SPORTS 1.qa' });
    assert.equal(env.GuidePick.get('s2', channel), null);
    assert.equal(env.GuidePick.get('s1', { stream_id: 8 }), null);
    env.GuidePick.set('s1', channel, null);
    assert.equal(env.GuidePick.get('s1', channel), null);
    same(touched, ['s1', 's1']);
});

test('the guide channels offered are those sharing words with the name, a number counting double', function () {
    var env = load(['xmltv-parser.js', 'guide-pick.js'], {}, { Log: { error: function () {} } }).globals;
    var entries = ['beIN SPORTS 1.qa', 'beIN SPORTS 2.qa', 'beIN SPORTS MAX 1.qa', 'Jordan TV.jo'].map(function (id) { return { n: 1, id: id }; });
    var ranked = env.GuidePick.rank('beIN SP 1 HD', entries).map(function (entry) { return entry.id; });
    same(ranked, ['beIN SPORTS 1.qa', 'beIN SPORTS MAX 1.qa', 'beIN SPORTS 2.qa']);
});

test('two links and the provider are asked in the viewer\'s order (#90)', async function () {
    var asked = [];
    var env = load(['guide-data.js'], {}, {
        Log: { error: function () {} },
        XmltvGuide: function (link) {
            return { name: link.id, programmes: function () { asked.push(link.id); return Promise.resolve(link.n === 2 ? [{ title: 'Two', start: 0, end: 10 }] : null); } };
        },
    }).globals;
    var adapter = { schedule: function () { asked.push('provider'); return Promise.resolve(null); } };
    var source = { id: 's1', type: 'xtream', epgUrl: A, epgUrl2: B, epgOrder: ['provider', '1', '2'] };
    same(env.GuideData.chain(source, adapter).map(function (entry) { return entry.name; }), ['provider', 's1', 's1#2']);
    var list = await env.GuideData(source, adapter).programmes({ stream_id: 1 }, 0, 100);
    assert.equal(list[0].title, 'Two');
    same(asked, ['provider', 's1', 's1#2']);
});
