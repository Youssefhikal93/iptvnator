// The programme schedule of one source: every programme a channel has over
// a time range, from an ordered chain of guide sources. A guide source is
// { programmes(channel) -> Promise<list or null> } where list holds
// { title, desc, start, end } (ms, sorted by start) and null means "no guide
// for this channel here, ask the next source". The first list wins.
window.GuideData = function (source, adapter) {
    'use strict';

    var KEEP_MS = 30 * 60 * 1000;
    var chain = GuideData.chain(source, adapter);
    var store = {}; // channel key -> { list, until }
    var loading = {}; // channel key -> Promise
    var stopped = false;

    function keyOf(channel) {
        return channel.stream_id !== undefined ? 'id:' + channel.stream_id : 'url:' + channel.url;
    }

    function ask(channel, i) {
        if (i >= chain.length) return Promise.resolve([]);
        return Promise.resolve()
            .then(function () {
                return chain[i].programmes(channel);
            })
            .catch(function (err) {
                Log.error('GUIDE FAIL ' + (chain[i].name || i) + ' ' + err.message);
                return null;
            })
            .then(function (list) {
                return list ? list : ask(channel, i + 1);
            });
    }

    function within(list, from, to) {
        return list.filter(function (p) {
            return p.end > from && p.start < to;
        });
    }

    function all(channel) {
        var key = keyOf(channel);
        var entry = store[key];
        if (entry && Date.now() < entry.until) return Promise.resolve(entry.list);
        if (stopped || !chain.length) return Promise.resolve([]);
        if (!loading[key]) {
            loading[key] = ask(channel, 0).then(function (list) {
                delete loading[key];
                if (!stopped) store[key] = { list: list, until: Date.now() + KEEP_MS };
                return list;
            });
        }
        return loading[key];
    }

    return {
        // True when at least one guide source can answer for this source.
        available: chain.length > 0,
        // Programmes overlapping [from, to), fetched if needed; [] when none.
        programmes: function (channel, from, to) {
            return all(channel).then(function (list) {
                return within(list, from, to);
            });
        },
        // Saved programmes only (sync), or undefined when not fetched yet.
        peek: function (channel, from, to) {
            var entry = store[keyOf(channel)];
            if (!entry || Date.now() >= entry.until) return undefined;
            return within(entry.list, from, to);
        },
        // A local snapshot only: never call the guide source chain here.
        // The first guide with programmes for a channel wins, in the viewer's order (#90).
        // Guides are read one after another, each only for the channels still without one.
        cached: function (channels, epg) {
            var order = [];
            if (source) GuideLinks.each(source, function (link) { order.push(link); }, true);
            // A fetched schedule that came back empty is no answer: the
            // cached guides below may still have the channel.
            var lists = channels.map(function (channel) {
                var entry = store[keyOf(channel)];
                return entry && entry.list.length ? entry.list : null;
            });
            var step = Promise.resolve();
            order.forEach(function (link) {
                step = step.then(function () {
                    var waiting = [];
                    lists.forEach(function (list, index) { if (list === null) waiting.push(index); });
                    if (!waiting.length) return null;
                    if (!link) {
                        waiting.forEach(function (index) {
                            var list = epg ? epg.cached(channels[index]) : [];
                            if (list.length) lists[index] = list;
                        });
                        return null;
                    }
                    if (!window.XmltvStore) return null;
                    return XmltvStore.cached(link, waiting.map(function (index) { return channels[index]; })).then(function (schedules) {
                        waiting.forEach(function (index, at) {
                            var list = schedules[at] || [];
                            if (list.length) lists[index] = list;
                        });
                    });
                });
            });
            return step.then(function () {
                return channels.map(function (channel, index) { return { channel: channel, programmes: lists[index] || [] }; });
            });
        },
        stop: function () {
            stopped = true;
            store = {};
        },
    };
};

// The guide sources for a source, in the order they are asked.
window.GuideData.chain = function (source, adapter) {
    'use strict';

    var chain = [];
    // The provider's full schedule (#6).
    var provider = {
        name: 'provider',
        programmes: function (channel) {
            return adapter.schedule(channel);
        },
    };
    if (!source || !window.XmltvGuide) return adapter && adapter.schedule ? [provider] : [];
    // The guide links and the provider in the viewer's order (#90).
    GuideLinks.each(source, function (link) {
        chain.push(link ? XmltvGuide(link) : provider);
    }, !!(adapter && adapter.schedule));
    return chain;
};
