// Saved catalogue per source (categories, items, episodes) in IndexedDB, so
// the app can start from the last lists while it refreshes them. Every call
// resolves even when IndexedDB is unavailable: a miss just means "load it".
window.Catalogue = (function () {
    'use strict';

    var DB = 'iptvnator-tv';
    var STORE = 'catalogue';
    var opening = null;

    function open() {
        if (!opening) {
            opening = new Promise(function (resolve) {
                try {
                    var req = indexedDB.open(DB, 1);
                    req.onupgradeneeded = function () {
                        req.result.createObjectStore(STORE);
                    };
                    req.onsuccess = function () {
                        resolve(req.result);
                    };
                    req.onerror = function () {
                        Log.error('CATALOGUE OPEN FAIL ' + (req.error && req.error.message));
                        resolve(null);
                    };
                } catch (e) {
                    resolve(null);
                }
            });
        }
        return opening;
    }

    // Runs fn(store) in one transaction; resolves with its request's result.
    function run(mode, fn) {
        return open().then(function (db) {
            if (!db) return undefined;
            return new Promise(function (resolve) {
                try {
                    var tx = db.transaction(STORE, mode);
                    var req = fn(tx.objectStore(STORE));
                    tx.oncomplete = function () {
                        resolve(req && req.result);
                    };
                    tx.onerror = tx.onabort = function () {
                        Log.error('CATALOGUE ' + mode + ' FAIL ' + (tx.error && tx.error.message));
                        resolve(undefined);
                    };
                } catch (e) {
                    resolve(undefined);
                }
            });
        });
    }

    function keyOf(sourceId, key) {
        return sourceId + '|' + key;
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

    return {
        same: same,
        get: function (sourceId, key) {
            return run('readonly', function (store) {
                return store.get(keyOf(sourceId, key));
            });
        },
        put: function (sourceId, key, value) {
            return run('readwrite', function (store) {
                store.put(value, keyOf(sourceId, key));
            });
        },
        // Everything saved for a source (on remove or a manual refresh).
        drop: function (sourceId) {
            return run('readwrite', function (store) {
                store.delete(IDBKeyRange.bound(keyOf(sourceId, ''), keyOf(sourceId, '￿')));
            });
        },
    };
})();
