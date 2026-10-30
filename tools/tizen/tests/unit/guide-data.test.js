'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

function sandbox(xmltv) {
    var overrides = { Log: { error: function () {} } };
    if (xmltv) overrides.XmltvGuide = xmltv;
    return load(['guide-data.js'], {}, overrides).globals.GuideData;
}

function p(title, start, end) {
    return { title: title, desc: '', start: start, end: end };
}

test('asks guide sources in order and the first list wins; null falls through', async function () {
    var asked = [];
    var GuideData = sandbox(function () {
        return {
            name: 'xmltv',
            programmes: function (channel) {
                asked.push('xmltv');
                return Promise.resolve(channel.stream_id === 1 ? [p('Own', 0, 10)] : null);
            },
        };
    });
    var adapter = {
        schedule: function () {
            asked.push('provider');
            return Promise.resolve([p('Provider', 0, 10)]);
        },
    };
    var guide = GuideData({ epgUrl: 'http://x/epg.xml' }, adapter);
    assert.equal(guide.available, true);
    assert.equal((await guide.programmes({ stream_id: 1 }, 0, 100))[0].title, 'Own');
    assert.equal((await guide.programmes({ stream_id: 2 }, 0, 100))[0].title, 'Provider');
    assert.deepEqual(asked, ['xmltv', 'xmltv', 'provider']);
});

test('without a guide link only the provider schedule is asked', function () {
    var made = 0;
    var GuideData = sandbox(function () {
        made++;
        return { programmes: function () {} };
    });
    assert.equal(GuideData({}, { schedule: function () {} }).available, true);
    assert.equal(made, 0);
    assert.equal(GuideData({ epgUrl: 'x' }, {}).available, true);
    assert.equal(made, 1);
    assert.equal(GuideData({}, {}).available, false);
});

test('provider-first preference uses XMLTV only for channels the provider lacks', async function () {
    var GuideData = sandbox(function () {
        return { programmes: function () { return Promise.resolve([p('Own', 0, 10)]); } };
    });
    var guide = GuideData({ epgUrl: 'http://x/epg.xml', epgPrefer: false }, {
        schedule: function (channel) { return Promise.resolve(channel.stream_id === 1 ? [p('Provider', 0, 10)] : null); },
    });
    assert.equal((await guide.programmes({ stream_id: 1 }, 0, 10))[0].title, 'Provider');
    assert.equal((await guide.programmes({ stream_id: 3 }, 0, 10))[0].title, 'Own');
});

test('filters to the time range, keeps results and peeks synchronously', async function () {
    var calls = 0;
    var GuideData = sandbox();
    var guide = GuideData({}, {
        schedule: function () {
            calls++;
            return Promise.resolve([p('A', 0, 10), p('B', 10, 20), p('C', 20, 30)]);
        },
    });
    var channel = { stream_id: 5 };
    assert.equal(guide.peek(channel, 0, 30), undefined);
    var both = await Promise.all([guide.programmes(channel, 5, 15), guide.programmes(channel, 0, 30)]);
    assert.equal(both[0].map(function (x) { return x.title; }).join(), 'A,B');
    assert.equal(both[1].length, 3);
    assert.equal(guide.peek(channel, 20, 25).map(function (x) { return x.title; }).join(), 'C');
    assert.equal(calls, 1);
});

test('a failing source is skipped, a channel without any guide gives []', async function () {
    var GuideData = sandbox(function () {
        return { programmes: function () { return Promise.reject(new Error('down')); } };
    });
    var guide = GuideData({ epgUrl: 'x' }, { schedule: function () { return Promise.resolve(null); } });
    assert.equal((await guide.programmes({ url: 'http://a' }, 0, 10)).length, 0);
    guide.stop();
    assert.equal(guide.peek({ url: 'http://a' }, 0, 10), undefined);
});

test('#81 search includes cached full schedules and now/next without fetching unloaded channels', async function () {
    var calls = 0;
    var env = load(['guide-data.js', 'settings-store.js', 'epg.js'], {}, { Log: { error: function () {} } }).globals;
    var adapter = {
        schedule: function () { calls++; return Promise.resolve([p('Full', 0, 10)]); },
        nowNext: function () { calls++; return Promise.resolve([p('Short', 10, 20)]); },
    };
    var channels = [{ stream_id: 1 }, { stream_id: 2 }, { stream_id: 3 }];
    var guide = env.GuideData({}, adapter);
    var epg = env.Epg(adapter);
    await guide.programmes(channels[0], 0, 10);
    await epg.load(channels[1]);
    var schedules = await guide.cached(channels, epg);
    assert.equal(schedules.map(function (schedule) { return schedule.programmes.map(function (x) { return x.title; }).join(); }).join('|'), 'Full|Short|');
    assert.equal(calls, 2);
    guide.stop();
    epg.stop();
});

test('#81 local XMLTV and provider cache respect source preference and fallback', async function () {
    var env = load(['guide-data.js'], {}, {
        XmltvGuide: function () { return { programmes: function () { throw new Error('network forbidden'); } }; },
        XmltvStore: { cached: function () { return Promise.resolve({ 0: [p('Own', 0, 10)] }); } },
    }).globals;
    var channels = [{ stream_id: 1 }, { stream_id: 2 }];
    var epg = { cached: function () { return [p('Provider', 0, 10)]; } };
    for (var prefer of [true, false]) {
        var guide = env.GuideData({ epgUrl: 'saved', epgPrefer: prefer }, {});
        var schedules = await guide.cached(channels, epg);
        assert.equal(schedules[0].programmes[0].title, prefer ? 'Own' : 'Provider');
        assert.equal(schedules[1].programmes[0].title, 'Provider');
    }
});
