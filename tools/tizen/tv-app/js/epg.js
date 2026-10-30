// Now/next programmes per live channel for one source. Fetched only for the
// channels on screen, a few at a time, and kept until the current programme
// ends. The adapter supplies nowNext(channel) -> [{ title, desc, start, end }]
// with times in ms; channels without a guide resolve to [].
window.Epg = function (adapter, source) {
    'use strict';

    var PARALLEL = 3;
    var NO_GUIDE_RETRY_MS = 30 * 60 * 1000;
    var FAILED_RETRY_MS = 2 * 60 * 1000;
    var store = {}; // stream id -> { list, until }
    var loading = {}; // stream id -> Promise
    var queue = [];
    var active = 0;
    var stopped = false;
    var paused = false;
    var chain = [];
    var own = source && source.epgUrl ? XmltvGuide(source) : null;
    if (own && source.epgPrefer !== false) chain.push(own.programmes);
    if (adapter.nowNext) chain.push(function (channel) { return adapter.nowNext(channel); });
    if (own && source.epgPrefer === false) chain.push(own.programmes);

    function revision() {
        return source && window.XmltvGuide ? XmltvGuide.revision(source.id) : 0;
    }

    // The first guide source with programmes wins. A source that failed
    // (rather than answering "nothing") rejects at the end, so the channel is
    // asked again soon instead of being marked as having no guide; a busy
    // provider (429) stops the chain at once.
    function ask(channel, at, failure) {
        if (at >= chain.length) return failure ? Promise.reject(failure) : Promise.resolve([]);
        return Promise.resolve().then(function () { return chain[at](channel); }).then(function (list) {
            return list && list.length ? list : ask(channel, at + 1, failure);
        }, function (err) {
            if (err && err.code === 'busy') throw err;
            Log.error('EPG source failed');
            return ask(channel, at + 1, err || new Error('EPG source failed'));
        });
    }

    function idOf(channel) {
        return channel.stream_id !== undefined ? 'id:' + channel.stream_id : 'url:' + channel.url;
    }

    // When a guide lists programmes on top of each other, the one that
    // started last is what is on now: providers often keep a long block (a
    // replay slot) over the short programmes inside it. Next is the first
    // programme after it ends.
    function pick(list, now) {
        var current = null;
        var next = null;
        list.forEach(function (p) {
            if (p.start <= now && now < p.end && (!current || p.start > current.start)) current = p;
        });
        list.forEach(function (p) {
            if (current && p.start >= current.end && (!next || p.start < next.start)) next = p;
        });
        return { now: current, next: next };
    }

    // Saved programmes for a channel: { now, next } (either may be null),
    // or undefined when they still have to be fetched.
    function peek(channel) {
        var entry = store[idOf(channel)];
        if (!entry || entry.revision !== revision() || Date.now() >= entry.until) return undefined;
        return pick(entry.list, Date.now());
    }

    function fetchOne(channel) {
        if (stopped || !Prefs.get('programmeGuide')) return Promise.resolve({ now: null, next: null });
        var id = idOf(channel);
        if (!loading[id]) {
            loading[id] = ask(channel, 0)
                .then(function (list) {
                    return { list: list, retry: NO_GUIDE_RETRY_MS };
                }, function (err) {
                    Log.error('EPG FAIL ' + (err && err.code === 'busy' ? 'busy' : err && err.message));
                    // Ask again after the provider's rest, or soon after a failure.
                    return { list: [], retry: err && err.code === 'busy' ? Math.max(1000, err.wait || 0) : FAILED_RETRY_MS };
                })
                .then(function (got) {
                    var list = got.list;
                    var current = pick(list, Date.now()).now;
                    store[id] = { list: list, revision: revision(), until: current ? current.end : Date.now() + got.retry };
                    delete loading[id];
                    return peek(channel) || { now: null, next: null };
                });
        }
        return loading[id];
    }

    function pump(done) {
        while (!stopped && !paused && Prefs.get('programmeGuide') && active < PARALLEL && queue.length) {
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
        pause: function (on) {
            paused = on;
            if (on) queue = [];
        },
        peek: peek,
        // Search reads saved schedules even after their refresh deadline.
        cached: function (channel) {
            var entry = store[idOf(channel)];
            return entry ? entry.list : [];
        },
        // Programmes for one channel (the player), fetched if needed.
        load: function (channel) {
            var saved = peek(channel);
            return saved ? Promise.resolve(saved) : fetchOne(channel);
        },
        // Fetches the last `limit` distinct channels asked for (the screen
        // the user stopped on); done() runs after each arrives.
        want: function (channels, limit, done) {
            if (paused) return;
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
