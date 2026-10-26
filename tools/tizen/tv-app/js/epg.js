// Now/next programmes per live channel for one source. Fetched only for the
// channels on screen, a few at a time, and kept until the current programme
// ends. The adapter supplies nowNext(channel) -> [{ title, desc, start, end }]
// with times in ms; channels without a guide resolve to [].
window.Epg = function (adapter) {
    'use strict';

    var PARALLEL = 3;
    var NO_GUIDE_RETRY_MS = 30 * 60 * 1000;
    var store = {}; // stream id -> { list, until }
    var loading = {}; // stream id -> Promise
    var queue = [];
    var active = 0;
    var stopped = false;

    function idOf(channel) {
        return String(channel.stream_id);
    }

    function pick(list, now) {
        var current = null;
        var next = null;
        list.forEach(function (p) {
            if (!current && p.start <= now && now < p.end) current = p;
        });
        list.forEach(function (p) {
            if (!next && current && p.start >= current.end) next = p;
        });
        return { now: current, next: next };
    }

    // Saved programmes for a channel: { now, next } (either may be null),
    // or undefined when they still have to be fetched.
    function peek(channel) {
        var entry = store[idOf(channel)];
        if (!entry || Date.now() >= entry.until) return undefined;
        return pick(entry.list, Date.now());
    }

    function fetchOne(channel) {
        if (stopped || !Library.setting('programmeGuide')) return Promise.resolve({ now: null, next: null });
        var id = idOf(channel);
        if (!loading[id]) {
            loading[id] = adapter
                .nowNext(channel)
                .catch(function (err) {
                    Log.error('EPG FAIL ' + err.message);
                    return [];
                })
                .then(function (list) {
                    var current = pick(list, Date.now()).now;
                    store[id] = { list: list, until: current ? current.end : Date.now() + NO_GUIDE_RETRY_MS };
                    delete loading[id];
                    return peek(channel) || { now: null, next: null };
                });
        }
        return loading[id];
    }

    function pump(done) {
        while (!stopped && Library.setting('programmeGuide') && active < PARALLEL && queue.length) {
            var channel = queue.shift();
            if (peek(channel) !== undefined) continue;
            active++;
            fetchOne(channel).then(function () {
                active--;
                if (!stopped) done();
                pump(done);
            });
        }
    }

    return {
        stop: function () {
            stopped = true;
            queue = [];
        },
        peek: peek,
        // Programmes for one channel (the player), fetched if needed.
        load: function (channel) {
            var saved = peek(channel);
            return saved ? Promise.resolve(saved) : fetchOne(channel);
        },
        // Fetches the last `limit` distinct channels asked for (the screen
        // the user stopped on); done() runs after each arrives.
        want: function (channels, limit, done) {
            var seen = {};
            queue = [];
            for (var i = channels.length - 1; i >= 0 && queue.length < limit; i--) {
                var id = idOf(channels[i]);
                if (seen[id] || loading[id] || peek(channels[i]) !== undefined) continue;
                seen[id] = true;
                queue.unshift(channels[i]);
            }
            pump(done);
        },
    };
};
