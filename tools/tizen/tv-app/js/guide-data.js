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
    // The viewer's own guide link (XMLTV, #7) wins when it has the channel.
    if (window.XmltvGuide && source && source.epgUrl) chain.push(XmltvGuide(source));
    // The provider's full schedule (#6).
    if (adapter && adapter.schedule) {
        chain.push({
            name: 'provider',
            programmes: function (channel) {
                return adapter.schedule(channel);
            },
        });
    }
    return chain;
};
