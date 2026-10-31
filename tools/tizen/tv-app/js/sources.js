// Saved sources (Xtream accounts and M3U links) in the TV's localStorage.
window.Sources = (function () {
    'use strict';

    var LIST_KEY = 'iptvnator-tv:sources';
    var CURRENT_KEY = 'iptvnator-tv:current';
    // Single Xtream login saved by the first version of the app.
    var LEGACY_KEY = 'iptvnator-tv:credentials';

    function read(key) {
        try {
            return Stored.json(key);
        } catch (e) {
            return null;
        }
    }

    function write(key, value) {
        try {
            Stored.save(key, value);
        } catch (e) {
            // Kept for this session only.
        }
    }

    function hostName(url) {
        try {
            return new URL(url).hostname;
        } catch (e) {
            return url;
        }
    }

    function all() {
        var list;
        try {
            list = Stored.json(LIST_KEY);
            if (list !== null && !Array.isArray(list)) throw new Error('Invalid sources list');
        } catch (e) {
            // A read failure is not an empty library. Leave the original intact.
            var err = new Error('Could not read saved data');
            err.code = 'saved';
            throw err;
        }
        if (list) return list;
        var legacy = read(LEGACY_KEY);
        list = [];
        if (legacy) {
            list.push({ id: 's1', type: 'xtream', name: hostName(legacy.url), url: legacy.url, user: legacy.user, pass: legacy.pass });
            write(CURRENT_KEY, 's1');
        }
        write(LIST_KEY, list);
        return list;
    }

    function add(source) {
        var list = all();
        source.id = 's' + Date.now();
        source.name = (source.name || '').trim() || hostName(source.url);
        list.push(source);
        write(LIST_KEY, list);
        return source;
    }

    function remove(id) {
        if (window.ProgressMigration) ProgressMigration.removeSource(id);
        if (window.XmltvGuide) XmltvGuide.remove(id);
        if (window.AutoRefresh) AutoRefresh.forget(id);
        if (window.TitleFacts) TitleFacts.forget(id);
        write(
            LIST_KEY,
            all().filter(function (s) {
                return s.id !== id;
            })
        );
        if (read(CURRENT_KEY) === id) write(CURRENT_KEY, null);
    }

    function current() {
        var id = read(CURRENT_KEY);
        return (
            all().filter(function (s) {
                return s.id === id;
            })[0] || null
        );
    }

    return {
        all: all,
        // Backup restore needs a checked write so it can roll back on failure.
        replace: function (sources) { Stored.save(LIST_KEY, sources); },
        add: add,
        update: function (source) {
            write(LIST_KEY, all().map(function (saved) { return saved.id === source.id ? source : saved; }));
        },
        rekey: function (oldId, source) {
            write(LIST_KEY, all().map(function (saved) { return saved.id === oldId ? source : saved; }));
            if (read(CURRENT_KEY) === oldId) write(CURRENT_KEY, source.id);
        },
        remove: remove,
        current: current,
        setCurrent: function (id) {
            write(CURRENT_KEY, id);
        },
        typeLabel: function (source) {
            return I18n.t(source.type === 'xtream' ? 'sources.typeXtream' : 'sources.typeM3u');
        },
    };
})();
