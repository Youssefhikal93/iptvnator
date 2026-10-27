// Saved lists appear first; a loader belongs to exactly one source.
window.CatalogueLoader = function (deps) {
    'use strict';

    var memory = {};
    var pending = {};
    var refreshed = {};
    var generation = 0;
    var retired = false;
    var updating = 0;
    var ready = Promise.resolve();

    // These keys also address catalogues saved by earlier app versions.
    function keyOf(what) {
        if (what.kind === 'show') return 'series:' + what.id;
        if (what.kind === 'movie') return 'vod:' + what.id;
        return what.section + ':' + what.kind + (what.kind === 'items' ? ':' + (what.id === undefined ? '' : what.id) : '');
    }

    function sameItem(current, saved) {
        if (current === saved) return true;
        if (!current || !saved || typeof current !== 'object' || typeof saved !== 'object') return false;
        var fields = Object.keys(current);
        var previous = Object.keys(saved);
        if (fields.length !== previous.length) return false;
        return fields.every(function (field, index) {
            if (field !== previous[index]) return false;
            if (current[field] === saved[field]) return true;
            // Nested provider metadata is uncommon in lists; retain the old comparison there.
            return JSON.stringify(current[field]) === JSON.stringify(saved[field]);
        });
    }

    function same(current, saved) {
        if (current === saved) return true;
        if (!Array.isArray(current) || !Array.isArray(saved)) return JSON.stringify(current) === JSON.stringify(saved);
        if (current.length !== saved.length) return false;
        var identity = ['stream_id', 'series_id', 'num', 'name'];
        var matching = current.every(function (item, index) {
            if (!item || !saved[index]) return item === saved[index];
            return identity.every(function (field) { return item[field] === saved[index][field]; });
        });
        return matching && current.every(function (item, index) { return sameItem(item, saved[index]); });
    }

    function current(mine) {
        return !retired && mine === generation;
    }

    function check(mine) {
        if (current(mine)) return;
        var error = new Error('Catalogue load cancelled');
        error.code = 'cancelled';
        throw error;
    }

    function provider(what) {
        if (what.kind === 'categories') return deps.adapter.categories(what.section);
        if (what.kind === 'items') return deps.adapter.items(what.section, what.id === undefined ? '' : what.id);
        if (what.kind === 'show') return deps.adapter.seriesInfo(what.item || { series_id: what.id });
        return deps.adapter.movieInfo(what.item || { stream_id: what.id });
    }

    function fetch(what, options, mine) {
        var run = function () {
            check(mine);
            return provider(what);
        };
        if (!options.screen) return Promise.resolve().then(run);
        return deps.screen(deps.sourceId + ':' + keyOf(what), run, function () {
            return current(mine) && (!options.active || options.active());
        });
    }

    function save(key, catalogue, mine) {
        if (deps.stamps && current(mine)) deps.stamps.set(key);
        check(mine);
        memory[key] = catalogue;
        deps.store.put(deps.sourceId, key, catalogue);
        return catalogue;
    }

    function changedUpdating(count) {
        updating = count;
        deps.onUpdating(count);
    }

    // A saved list refreshes in the background once a session, and with
    // deps.stamps no sooner than REFRESH_AGE_MS after its last refresh:
    // whole catalogues are large and providers limit requests. With
    // deps.stamps, category and item lists never refresh by themselves, like
    // the desktop app: the viewer refreshes them (Settings > Sources > Refresh
    // content now). A movie or show page still refreshes once a day when
    // opened, so new episodes show up; that is one request on a key press.
    var REFRESH_AGE_MS = 24 * 3600000;
    function refreshSaved(what, options, saved, mine) {
        var key = keyOf(what);
        if (refreshed[key]) return;
        refreshed[key] = true;
        if (deps.stamps && (what.kind === 'categories' || what.kind === 'items')) return;
        if (deps.stamps && Date.now() - deps.stamps.get(key) < REFRESH_AGE_MS) return;
        changedUpdating(updating + 1);
        fetch(what, options, mine).then(function (catalogue) {
            save(key, catalogue, mine);
            if (options.onFresh && !same(catalogue, saved)) options.onFresh(catalogue);
        }).catch(function () {
            // Keep the saved catalogue usable when its background refresh fails.
            if (current(mine)) Log.error('CATALOGUE REFRESH FAIL');
        }).then(function () {
            if (current(mine)) changedUpdating(updating - 1);
        });
    }

    function read(what, options, mine) {
        var key = keyOf(what);
        // Movie details and show episodes are saved too, so a restart does not
        // ask the provider again for the titles Home shows.
        return deps.store.get(deps.sourceId, key).then(function (saved) {
            check(mine);
            if (saved === undefined) return fetch(what, options, mine).then(function (catalogue) {
                return save(key, catalogue, mine);
            });
            memory[key] = saved;
            refreshSaved(what, options, saved, mine);
            return saved;
        });
    }

    function load(what, options) {
        var key = keyOf(what);
        var mine = generation;
        if (retired) return Promise.resolve().then(function () { check(mine); });
        if (memory[key] !== undefined) {
            var known = memory[key];
            return Promise.resolve().then(function () { check(mine); return known; });
        }
        if (pending[key]) return pending[key];
        var loading = ready.then(function () {
            check(mine);
            return read(what, options || {}, mine);
        }).then(function (catalogue) {
            check(mine);
            delete pending[key];
            return catalogue;
        }, function (error) {
            check(mine);
            delete pending[key];
            throw error;
        });
        pending[key] = loading;
        return loading;
    }

    function forget() {
        generation++;
        memory = {};
        pending = {};
        refreshed = {};
        changedUpdating(0);
    }

    return {
        load: load,
        peek: function (what) { return memory[keyOf(what)]; },
        drop: function () {
            forget();
            ready = deps.store.drop(deps.sourceId);
            return ready;
        },
        // Switching source must keep its saved lists but retire all late work.
        dispose: function () {
            retired = true;
            forget();
        },
    };
};
