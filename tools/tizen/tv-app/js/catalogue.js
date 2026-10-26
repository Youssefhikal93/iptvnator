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

    return {
        // Backup can attribute watched items that have no favorite or recent snapshot.
        entries: function (sourceId) {
            var entries = [];
            return run('readonly', function (store) {
                var req = store.openCursor(IDBKeyRange.bound(keyOf(sourceId, ''), keyOf(sourceId, '\uffff')));
                req.onsuccess = function () {
                    var cursor = req.result;
                    if (!cursor) return;
                    entries.push({ key: cursor.key.slice(sourceId.length + 1), value: cursor.value });
                    cursor.continue();
                };
                return { result: entries };
            });
        },
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
