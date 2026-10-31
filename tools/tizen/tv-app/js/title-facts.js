// What a box knows of a title beyond the list (#91): a film's length and a
// show's seasons, learnt from its page (the provider or TMDB) or from the
// boxes' TMDB lookup, and kept across restarts for the last 2000 titles.
// Read from storage once: the box views ask on every move.
window.TitleFacts = (function () {
    'use strict';

    var KEY = 'iptvnator-tv:title-facts';
    var LIMIT = 2000;
    var memo = null; // { order: [key, ...] oldest first, facts: { key: { minutes, seasons } } }

    function all() {
        if (memo) return memo;
        var saved = null;
        try { saved = Stored.json(KEY); } catch (e) { saved = null; }
        var good = saved && typeof saved.facts === 'object' && saved.facts && Array.isArray(saved.order);
        memo = good ? { order: saved.order.slice(), facts: Object.assign({}, saved.facts) } : { order: [], facts: {} };
        return memo;
    }

    function write() {
        try { Stored.save(KEY, memo); }
        catch (e) { Log.error('Title facts could not be saved'); }
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
            var at = store.order.indexOf(key);
            if (at >= 0) store.order.splice(at, 1);
            store.order.push(key);
            while (store.order.length > LIMIT) delete store.facts[store.order.shift()];
            write();
            return true;
        },
        // A removed source's titles go with it.
        forget: function (sourceId) {
            var store = all();
            var prefix = sourceId + '|';
            var kept = store.order.filter(function (key) { return key.indexOf(prefix) !== 0; });
            if (kept.length === store.order.length) return;
            store.order.forEach(function (key) { if (key.indexOf(prefix) === 0) delete store.facts[key]; });
            store.order = kept;
            write();
        },
    };
})();
