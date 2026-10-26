// Separate from the catalogue DB: publish a generation only after parsing succeeds.
window.XmltvStore = (function () {
    'use strict';

    var opening;
    var manifests = Object.create(null);

    function open() {
        if (!opening) opening = new Promise(function (resolve, reject) {
            var request = indexedDB.open('iptvnator-tv-guide', 1);
            request.onupgradeneeded = function () {
                request.result.createObjectStore('programmes', { keyPath: ['source', 'generation', 'channel', 'sequence'] });
                request.result.createObjectStore('sources', { keyPath: 'source' });
            };
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () { opening = null; reject(request.error); };
        });
        return opening;
    }

    function transaction(stores, action) {
        return open().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(stores, 'readwrite');
                tx.oncomplete = function () { resolve(); };
                tx.onabort = function () { reject(tx.error || new Error('Guide write aborted')); };
                action(tx);
            });
        });
    }

    function manifest(id) {
        if (!manifests[id]) manifests[id] = open().then(function (db) {
            return new Promise(function (resolve, reject) {
                var req = db.transaction('sources').objectStore('sources').get(id);
                req.onsuccess = function () { resolve(req.result || null); };
                req.onerror = function () { reject(req.error); };
            });
        }).catch(function (err) { delete manifests[id]; throw err; });
        return manifests[id];
    }

    function erase(range) {
        return transaction(['programmes'], function (tx) {
            tx.objectStore('programmes').delete(range);
        });
    }

    function prune(id, keep) {
        if (!keep) return erase(IDBKeyRange.bound([id], [id, []]));
        return transaction(['programmes'], function (tx) {
            var store = tx.objectStore('programmes');
            // Exclude the whole published generation, including all channel keys.
            store.delete(IDBKeyRange.bound([id], [id, keep], false, true));
            store.delete(IDBKeyRange.bound([id, keep, []], [id, []], true, false));
        });
    }

    function programmes(source, channel) {
        return manifest(source.id).then(function (saved) {
            if (!saved) return null;
            var id = XmltvParser.match(channel, saved.index);
            if (!id) return null;
            return open().then(function (db) {
                return new Promise(function (resolve, reject) {
                    var range = IDBKeyRange.bound([source.id, saved.generation, id], [source.id, saved.generation, id, []]);
                    var req = db.transaction('programmes').objectStore('programmes').getAll(range);
                    req.onsuccess = function () {
                        var list = req.result.map(function (p) { return { title: p.title, desc: p.desc, start: p.start, end: p.end }; });
                        list.sort(function (a, b) { return a.start - b.start; });
                        resolve(list.length ? list : null);
                    };
                    req.onerror = function () { reject(req.error); };
                });
            });
        });
    }

    return {
        programmes: programmes,
        batch: function (rows) {
            return transaction(['programmes'], function (tx) {
                var store = tx.objectStore('programmes');
                rows.forEach(function (row) { store.put(row); });
            });
        },
        publish: function (saved) {
            return transaction(['sources'], function (tx) { tx.objectStore('sources').put(saved); }).then(function () {
                manifests[saved.source] = Promise.resolve(saved);
            });
        },
        prune: prune,
        discard: function (id, generation) {
            return erase(IDBKeyRange.bound([id, generation], [id, generation, []]));
        },
        remove: function (id) {
            delete manifests[id];
            return transaction(['sources'], function (tx) { tx.objectStore('sources').delete(id); }).then(function () {
                return prune(id, null);
            });
        },
    };
})();
