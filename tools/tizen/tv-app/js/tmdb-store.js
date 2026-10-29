// Metadata has its own database; clearing a source never touches it.
window.TmdbStore = (function () {
    'use strict';

    var opening;
    var memory = {};

    function open() {
        if (!opening) opening = new Promise(function (resolve) {
            try {
                var req = indexedDB.open('iptvnator-tv-tmdb', 1);
                req.onupgradeneeded = function () { req.result.createObjectStore('responses'); };
                req.onsuccess = function () { resolve(req.result); };
                req.onerror = req.onblocked = function () { resolve(null); };
            } catch (e) { resolve(null); }
        });
        return opening;
    }

    function run(mode, key, record) {
        return open().then(function (db) {
            if (!db) return memory[key];
            return new Promise(function (resolve) {
                try {
                    var tx = db.transaction('responses', mode);
                    var store = tx.objectStore('responses');
                    var req = mode === 'readonly' ? store.get(key) : store.put(record, key);
                    tx.oncomplete = function () { resolve(mode === 'readonly' ? req.result : record); };
                    tx.onerror = tx.onabort = function () { resolve(memory[key]); };
                } catch (e) { resolve(memory[key]); }
            });
        });
    }

    function fresh(record) {
        return !!record && record.expires > Date.now();
    }

    return {
        fresh: fresh,
        get: function get(key, legacyKey) {
            if (fresh(memory[key])) return Promise.resolve(memory[key]);
            return run('readonly', key).then(function (record) {
                if (!fresh(record)) return legacyKey ? get(legacyKey) : null;
                memory[key] = record;
                return record;
            });
        },
        put: function (key, body, failed, status) {
            var record = { body: body, failed: !!failed, status: status || 0, expires: Date.now() + (failed ? 3600000 : 7 * 86400000) };
            memory[key] = record;
            return run('readwrite', key, record);
        },
        // Kept until replaced: the collection index (#58) is the app's own work.
        keep: function (key, body) {
            var record = { body: body, failed: false, expires: Infinity };
            memory[key] = record;
            return run('readwrite', key, record);
        },
    };
})();
