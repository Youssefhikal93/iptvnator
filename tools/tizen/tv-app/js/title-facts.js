// What a box knows of a title beyond the list (#91): a film's length and a
// show's seasons, learnt from its page (the provider or TMDB) or from the
// boxes' TMDB lookup, and kept across restarts for the last 2000 titles.
// Read from storage once: the box views ask on every move. Written at most
// once a second, as answers arrive in bursts while the viewer scrolls.
// Titles TMDB could not size are noted too, and not asked again for 30 days.
window.TitleFacts = (function () {
    'use strict';

    var KEY = 'iptvnator-tv:title-facts';
    var LIMIT = 2000;
    var WRITE_MS = 1000;
    var MISSING_MS = 30 * 24 * 3600000;
    // { order: [key, ...] oldest first, facts: { key: { minutes, seasons } }, missing: { key: time } }
    var memo = null;
    var writeTimer = null;

    function all() {
        if (memo) return memo;
        var saved = null;
        try { saved = Stored.json(KEY); } catch (e) { saved = null; }
        var good = saved && typeof saved.facts === 'object' && saved.facts && Array.isArray(saved.order);
        memo = good ? { order: saved.order.slice(), facts: Object.assign({}, saved.facts) } : { order: [], facts: {} };
        memo.missing = good && saved.missing && typeof saved.missing === 'object' ? Object.assign({}, saved.missing) : {};
        return memo;
    }

    function flush() {
        clearTimeout(writeTimer);
        writeTimer = null;
        if (!memo) return;
        try { Stored.save(KEY, memo); }
        catch (e) { Log.error('Title facts could not be saved'); }
    }

    function write() {
        if (!writeTimer) writeTimer = setTimeout(flush, WRITE_MS);
    }

    // Nothing waiting is lost when the app is put away.
    if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
    }

    function keyOf(sourceId, section, item) {
        var id = section === 'series' ? item.series_id : item.stream_id;
        if (id === undefined || id === null || id === '') id = item.url || item.name;
        return sourceId + '|' + section + '|' + id;
    }

    function whole(value) {
        var number = Math.round(Number(value));
        return number > 0 ? number : 0;
    }

    return {
        key: keyOf,
        flush: flush,
        // { minutes, seasons } as far as known, or null.
        get: function (sourceId, section, item) {
            return all().facts[keyOf(sourceId, section, item)] || null;
        },
        // found: { minutes } for a film, { seasons } for a show; nothing else is kept.
        // True when something new was kept.
        save: function (sourceId, section, item, found) {
            var store = all();
            var key = keyOf(sourceId, section, item);
            var old = store.facts[key] || {};
            var next = Object.assign({}, old);
            if (whole(found.minutes)) next.minutes = whole(found.minutes);
            if (whole(found.seasons)) next.seasons = whole(found.seasons);
            if (next.minutes === old.minutes && next.seasons === old.seasons) return false;
            store.facts[key] = next;
            delete store.missing[key];
            var at = store.order.indexOf(key);
            if (at >= 0) store.order.splice(at, 1);
            store.order.push(key);
            while (store.order.length > LIMIT) delete store.facts[store.order.shift()];
            write();
            return true;
        },
        // TMDB has no length or seasons for this title (or no such title).
        missing: function (sourceId, section, item) {
            var store = all();
            var now = Date.now();
            store.missing[keyOf(sourceId, section, item)] = now;
            var keys = Object.keys(store.missing);
            keys.forEach(function (key) { if (now - store.missing[key] >= MISSING_MS) delete store.missing[key]; });
            if (keys.length > LIMIT) {
                keys.sort(function (a, b) { return store.missing[a] - store.missing[b]; });
                keys.slice(0, keys.length - LIMIT).forEach(function (key) { delete store.missing[key]; });
            }
            write();
        },
        // Noted as missing less than 30 days ago: not worth asking again yet.
        missedLately: function (sourceId, section, item) {
            var at = all().missing[keyOf(sourceId, section, item)];
            return !!at && Date.now() - at < MISSING_MS;
        },
        // A removed source's titles go with it.
        forget: function (sourceId) {
            var store = all();
            var prefix = sourceId + '|';
            var kept = store.order.filter(function (key) { return key.indexOf(prefix) !== 0; });
            var missed = Object.keys(store.missing).filter(function (key) { return key.indexOf(prefix) === 0; });
            if (kept.length === store.order.length && !missed.length) return;
            store.order.forEach(function (key) { if (key.indexOf(prefix) === 0) delete store.facts[key]; });
            missed.forEach(function (key) { delete store.missing[key]; });
            store.order = kept;
            write();
        },
    };
})();
