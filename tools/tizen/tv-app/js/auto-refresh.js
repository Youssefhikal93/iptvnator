// Refresh automatically (#86): while the app is open and idle, sources and
// guides older than the chosen interval are fetched again in the background,
// one at a time. Nothing is fetched while something plays (ADR 0006: the
// account allows one connection) and a failure is only logged: the source
// tries again later and shows no error unless the viewer opens it.
//
// AutoRefresh.plan is the pure decision: what to refresh now, or nothing.
// deps: busy() -> whether something plays (full screen or in the live preview)
window.AutoRefresh = (function () {
    'use strict';

    var KEY = 'iptvnator-tv:refreshed:';
    var HOUR = 3600000;
    // "Daily at night": a night starts at 02:00. A source is due once that
    // night has begun without a refresh since, so a missed night is made up
    // at the next start. A refresh within six hours is not repeated.
    var NIGHT_HOUR = 2;
    var NIGHT_MIN_AGE = 6 * HOUR;
    var TWELVE = 12 * HOUR;
    // After a failed try nothing is fetched for an hour.
    var RETRY_MS = HOUR;
    // The app counts as idle after a minute without a key press.
    var IDLE_MS = 60000;
    var TICK_MS = 60000;

    var lastKey = Date.now();
    var running = false;

    function nightStart(now) {
        var night = new Date(now);
        night.setHours(NIGHT_HOUR, 0, 0, 0);
        if (night.getTime() > now) night.setDate(night.getDate() - 1);
        return night.getTime();
    }

    function due(now, mode, item) {
        var last = item.last || 0;
        if (now - (item.tried || 0) < RETRY_MS) return false;
        if (mode === 'twelve') return now - last >= TWELVE;
        return last < nightStart(now) && now - last >= NIGHT_MIN_AGE;
    }

    // input: { now, mode: 'off' | 'night' | 'twelve', busy, idleMs, items }
    // items: [{ last, tried, ... }] in the order they are to be fetched, with
    // last the time of the last good refresh and tried the last failed try
    // (0 when none). Returns the first due item, or null.
    function plan(input) {
        if (input.mode !== 'night' && input.mode !== 'twelve') return null;
        if (input.busy || input.idleMs < IDLE_MS) return null;
        for (var i = 0; i < input.items.length; i++) {
            if (due(input.now, input.mode, input.items[i])) return input.items[i];
        }
        return null;
    }

    function read(id) {
        try {
            var saved = Stored.json(KEY + id);
            return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
        } catch (e) {
            return {};
        }
    }

    function write(id, value) {
        try { Stored.save(KEY + id, value); }
        catch (e) { Log.error('Refresh time could not be saved'); }
    }

    function items() {
        var list = [];
        Sources.all().forEach(function (source) {
            var saved = read(source.id);
            list.push({ kind: 'source', source: source, last: saved.at, tried: saved.tried });
            // One item per guide link (#90); item.source is the link.
            GuideLinks.links(source).forEach(function (link) {
                var guide = XmltvGuide.times(link.id);
                list.push({ kind: 'guide', source: link, last: guide.updatedAt, tried: guide.failedAt });
            });
        });
        return list;
    }

    // Playback started: the refresh stops and is due again at once. A busy
    // provider (code 'busy', HTTP 429) is a failed try like any other.
    function stop() {
        var error = new Error('Playback started');
        error.code = 'playing';
        return error;
    }

    // The lists of every section, one request after the other, saved as the
    // app saves them when the viewer opens a section. Resolves with the
    // saved { key, value } entries.
    function fetchSource(source, deps) {
        var adapter = source.type === 'xtream' ? XtreamSource(source, { quiet: true }) : M3uSource(source);
        var steps = [];
        var saved = [];
        function step(section, kind) {
            steps.push(function () {
                if (deps.busy()) throw stop();
                var key = section + ':' + kind + (kind === 'items' ? ':' : '');
                return (kind === 'items' ? adapter.items(section, '') : adapter.categories(section)).then(function (list) {
                    saved.push({ key: key, value: list });
                    return Catalogue.put(source.id, key, list);
                });
            });
        }
        // A playlist knows its sections once it is downloaded.
        return (source.type === 'xtream' ? Promise.resolve() : adapter.account()).then(function () {
            adapter.sections.forEach(function (section) {
                step(section, 'categories');
                step(section, 'items');
            });
            return steps.reduce(function (done, next) { return done.then(next); }, Promise.resolve());
        }).then(function () { return saved; });
    }

    // The whole sections are new; a category's own saved list may be older,
    // so it goes, and the open source's loader takes the new lists (deps.published).
    function refreshSource(source, deps) {
        return fetchSource(source, deps).then(function (saved) {
            write(source.id, { at: Date.now() });
            return Catalogue.dropCategoryItems(source.id).then(function () {
                if (deps.published) deps.published(source.id, saved);
            });
        }, function (err) {
            if (err && err.code === 'playing') return;
            write(source.id, { at: read(source.id).at, tried: Date.now() });
            Log.error('AUTO REFRESH FAIL');
        });
    }

    function tick(deps) {
        if (running || document.hidden) return;
        var mode = Prefs.get('autoRefresh');
        if (mode !== 'night' && mode !== 'twelve') return;
        var item = plan({ now: Date.now(), mode: mode, busy: deps.busy(), idleMs: Date.now() - lastKey, items: items() });
        if (!item) return;
        running = true;
        var done = item.kind === 'guide' ? XmltvGuide.refresh(item.source) : refreshSource(item.source, deps);
        Promise.resolve(done).catch(function () {}).then(function () { running = false; });
    }

    function start(deps) {
        lastKey = Date.now();
        window.addEventListener('keydown', function () { lastKey = Date.now(); }, true);
        setInterval(function () { tick(deps); }, TICK_MS);
    }

    return {
        plan: plan,
        start: start,
        // One source's refresh as tick() runs it; deps as for start(), plus
        // published(sourceId, entries) once its new lists are saved.
        refreshSource: refreshSource,
        // A refresh the viewer asked for counts as the last one.
        mark: function (id) { write(id, { at: Date.now() }); },
        refreshedAt: function (id) { return read(id).at || 0; },
        forget: function (id) {
            try { Stored.remove(KEY + id); } catch (e) { /* Nothing saved. */ }
        },
    };
})();
