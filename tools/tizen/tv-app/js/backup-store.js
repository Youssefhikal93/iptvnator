// Backup writes are checked and rolled back: the normal playback stores are best effort.
window.BackupStore = (function () {
    'use strict';

    var PREFIX = 'iptvnator-tv:';
    var SECTIONS = ['live', 'movies', 'series'];

    // Sources are shared; everything else is the active profile's data.
    function storageKey(key) {
        if (key === 'progress') return Progress.storageKey();
        return key === 'sources' || key === 'current' ? PREFIX + key : ProfileStore.key(key);
    }

    function read(key, fallback) {
        var storedKey = storageKey(key);
        var saved = storedKey ? localStorage.getItem(storedKey) : null;
        return saved === null ? fallback : JSON.parse(saved);
    }

    function fingerprint(source) {
        var address = new URL(source.url);
        address.hash = '';
        var url = address.href;
        if (source.type === 'xtream') url = url.replace(/\/+$/, '');
        return JSON.stringify([source.type, url, source.type === 'xtream' ? source.user : '']);
    }

    function lists(saved, incoming, kind) {
        var merged = {};
        SECTIONS.forEach(function (section) {
            var byId = Object.create(null);
            (saved[section] || []).concat(incoming[section] || []).forEach(function (entry) {
                var key = Library.keyOf(section, entry);
                if (!byId[key] || (entry.watchedAt || 0) > (byId[key].watchedAt || 0)) byId[key] = entry;
            });
            merged[section] = Object.keys(byId).map(function (key) { return byId[key]; });
            if (kind === 'recent') merged[section].sort(function (a, b) { return (b.watchedAt || 0) - (a.watchedAt || 0); });
        });
        return merged;
    }

    function positions(saved, incoming) {
        Object.keys(incoming).forEach(function (key) {
            if (!saved[key] || incoming[key].updatedAt > (saved[key].updatedAt || 0)) saved[key] = incoming[key];
        });
        return saved;
    }

    function commit(writes, sources) {
        var before = {};
        Object.keys(writes).concat(['sources']).forEach(function (key) {
            before[key] = localStorage.getItem(storageKey(key));
        });
        try {
            Object.keys(writes).forEach(function (key) {
                if (key.indexOf('progress:') === 0 && writes[key] === null) localStorage.removeItem(storageKey(key));
                else localStorage.setItem(storageKey(key), JSON.stringify(writes[key]));
            });
            Sources.replace(sources);
        } catch (error) {
            // Release newly occupied space before restoring the previous footprint.
            Object.keys(before).forEach(function (key) { localStorage.removeItem(storageKey(key)); });
            Object.keys(before).forEach(function (key) {
                if (before[key] !== null) localStorage.setItem(storageKey(key), before[key]);
            });
            throw new Error('Could not save backup. Free TV storage and try again.');
        }
    }

    function apply(backup, mode) {
        if (mode !== 'merge' && mode !== 'replace') throw new Error('Choose Replace or Merge.');
        var existing = Sources.all();
        var sources = mode === 'merge' ? existing.slice() : [];
        var writes = {};
        var attributed = {};
        var catalogues = [];
        if (mode === 'replace') existing.forEach(function (source) {
            ['favorites:', 'recent:', 'last-channel:', 'backup:', 'progress:'].forEach(function (kind) { writes[kind + source.id] = null; });
        });
        backup.sources.forEach(function (entry, index) {
            var match = sources.filter(function (source) { return fingerprint(source) === fingerprint(entry.source); })[0];
            var id = 'backup-' + Date.now() + '-' + index;
            while (existing.concat(sources).some(function (source) { return source.id === id; })) id += '-new';
            var source = match || Object.assign({}, entry.source, { id: id });
            if (!match) sources.push(source);
            ['favorites', 'recent'].forEach(function (kind) {
                var key = kind + ':' + source.id;
                var saved = writes[key] || (mode === 'merge' ? read(key, {}) : {});
                writes[key] = lists(saved, entry[kind], kind);
            });
            var metadataKey = 'backup:' + source.id;
            var metadata = writes[metadataKey] || (mode === 'merge' ? read(metadataKey, {}) : {});
            writes[metadataKey] = {
                progressIds: (metadata.progressIds || []).concat(Object.keys(entry.progress)).filter(function (key, index, ids) { return ids.indexOf(key) === index; }),
            };
            if (entry.rawM3u) catalogues.push({ id: source.id, url: source.url, text: entry.rawM3u });
            var progressKey = 'progress:' + source.id;
            attributed[progressKey] = positions(attributed[progressKey] || {}, entry.progress);
            var progress = writes[progressKey] || (mode === 'merge' ? read(progressKey, {}) : {});
            writes[progressKey] = positions(progress, entry.progress);
        });
        var current = mode === 'merge' && Sources.current();
        writes.current = current ? current.id : sources.length ? sources[0].id : null;
        if (writes.current) {
            var currentKey = 'progress:' + writes.current;
            var currentProgress = writes[currentKey] || (mode === 'merge' ? read(currentKey, {}) : {});
            var fallback = {};
            // The old extension has no source id; explicit playlist positions win.
            Object.keys(backup.progress || {}).forEach(function (id) {
                if (!attributed[currentKey] || !attributed[currentKey][id]) fallback[id] = backup.progress[id];
            });
            writes[currentKey] = positions(currentProgress, fallback);
        }
        commit(writes, sources);
        // Raw playlists are catalogue data, never part of the localStorage library budget.
        return Promise.all(catalogues.map(function (catalogue) {
            return window.Catalogue ? Catalogue.put(catalogue.id, 'backup:m3u', { url: catalogue.url, text: catalogue.text }) : null;
        }));
    }

    return { read: read, fingerprint: fingerprint, apply: apply };
})();
