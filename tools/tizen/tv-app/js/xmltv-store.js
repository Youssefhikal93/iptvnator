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

    function has(map, key) {
        return Object.prototype.hasOwnProperty.call(map, key);
    }

    // The guide channel the viewer chose for a channel (#90), while it still
    // counts: its link is still the source's and its guide still lists it.
    // Otherwise (null) the channel pairs by id and name as before.
    function chosenFor(link, channel) {
        var owner = link.owner || link.id;
        var chosen = window.GuidePick ? GuidePick.get(owner, channel) : null;
        if (!chosen) return Promise.resolve(null);
        var source = window.Sources ? Sources.all().filter(function (saved) { return saved.id === owner; })[0] : null;
        if (source && !GuideLinks.url(source, chosen.n)) return Promise.resolve(null);
        var id = String(chosen.id).toLowerCase();
        return manifest(chosen.n === 1 ? owner : owner + '#' + chosen.n).then(function (saved) {
            return saved && has(saved.index.ids, id) ? { n: chosen.n, id: id } : null;
        }, function () { return null; });
    }

    // A channel chosen from another link has no programmes here.
    function matchIn(link, channel, index, chosen) {
        if (!chosen) return XmltvParser.match(channel, index);
        return chosen.n === (link.n || 1) ? index.ids[chosen.id] : null;
    }

    function read(db, source, saved, id) {
        return new Promise(function (resolve, reject) {
            var range = IDBKeyRange.bound([source.id, saved.generation, id], [source.id, saved.generation, id, []]);
            var req = db.transaction('programmes').objectStore('programmes').getAll(range);
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }

    function programmes(source, channel) {
        return Promise.all([manifest(source.id), chosenFor(source, channel)]).then(function (found) {
            var saved = found[0];
            if (!saved) return null;
            var id = matchIn(source, channel, saved.index, found[1]);
            if (!id) return null;
            return open().then(function (db) { return read(db, source, saved, id); }).then(function (rows) {
                var list = rows.map(function (p) { return { title: p.title, desc: p.desc, start: p.start, end: p.end }; });
                list.sort(function (a, b) { return a.start - b.start; });
                return list.length ? list : null;
            });
        });
    }

    // Only the programmes of the channels asked for: a whole guide can hold
    // hundreds of thousands, too many to hold in memory at once on a TV.
    function cached(source, channels) {
        return manifest(source.id).then(function (saved) {
            if (!saved) return {};
            return Promise.all(channels.map(function (channel) { return chosenFor(source, channel); })).then(function (chosen) {
                var ids = channels.map(function (channel, index) { return matchIn(source, channel, saved.index, chosen[index]) || null; });
                var wanted = ids.filter(function (id, at) { return id && ids.indexOf(id) === at; });
                return open().then(function (db) {
                    return Promise.all(wanted.map(function (id) { return read(db, source, saved, id); }));
                }).then(function (lists) {
                    var byChannel = Object.create(null);
                    wanted.forEach(function (id, at) { byChannel[id] = lists[at]; });
                    var schedules = {};
                    ids.forEach(function (id, index) { schedules[index] = id === null ? [] : byChannel[id] || []; });
                    return schedules;
                });
            });
        });
    }
    return {
        cached: cached,
        programmes: programmes,
        // A link's guide channels for choosing one by hand (#90): { id, label,
        // name }, id as the index keeps it; a guide saved before labels has only ids.
        channels: function (source) {
            return manifest(source.id).then(function (saved) {
                if (!saved) return [];
                var labels = saved.index.labels || {};
                return Object.keys(saved.index.ids).map(function (id) {
                    var label = labels[id] || [id, ''];
                    return { id: id, label: label[0], name: label[1] };
                });
            });
        },
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
