// Saved sources (Xtream accounts and M3U links) in the TV's localStorage.
window.Sources = (function () {
    'use strict';

    var LIST_KEY = 'iptvnator-tv:sources';
    var CURRENT_KEY = 'iptvnator-tv:current';
    // Single Xtream login saved by the first version of the app.
    var LEGACY_KEY = 'iptvnator-tv:credentials';

    function read(key) {
        try {
            return JSON.parse(localStorage.getItem(key));
        } catch (e) {
            return null;
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
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
        var list = read(LIST_KEY);
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
        add: add,
        remove: remove,
        current: current,
        setCurrent: function (id) {
            write(CURRENT_KEY, id);
        },
        typeLabel: function (source) {
            return source.type === 'xtream' ? 'Xtream Code' : 'M3U playlist';
        },
    };
})();
