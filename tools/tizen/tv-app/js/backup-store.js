// Backup writes are checked and rolled back: the normal playback stores are best effort.
window.BackupStore = (function () {
    'use strict';

    var PREFIX = 'iptvnator-tv:';
    var SECTIONS = ['live', 'movies', 'series'];

    // Sources and guide picks (#90) are shared; everything else is the active profile's data.
    function storageKey(key) {
        if (key === 'progress') return Progress.storageKey();
        return key === 'sources' || key === 'current' || key.indexOf('guide-pick:') === 0 ? PREFIX + key : ProfileStore.key(key);
    }

    function read(key, fallback) {
        var storedKey = storageKey(key);
        var saved = storedKey ? Stored.text(storedKey) : null;
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
            before[key] = Stored.text(storageKey(key));
        });
        try {
            Object.keys(writes).forEach(function (key) {
                if ((key.indexOf('progress:') === 0 || key.indexOf('guide-pick:') === 0) && writes[key] === null) Stored.remove(storageKey(key));
                else Stored.save(storageKey(key), writes[key]);
            });
            Sources.replace(sources);
        } catch (error) {
            // Release newly occupied space before restoring the previous footprint.
            Object.keys(before).forEach(function (key) { Stored.remove(storageKey(key)); });
            Object.keys(before).forEach(function (key) {
                if (before[key] !== null) Stored.put(storageKey(key), before[key]);
            });
            throw new Error('Could not save backup. Free TV storage and try again.');
        }
    }

    function apply(backup, mode) {
        if (mode !== 'merge' && mode !== 'replace') throw new Error('Choose Replace or Merge.');
        var existing = Sources.all();
        var sources = mode === 'merge' ? existing.slice() : [];
        var writes = {};
        var sourceIds = Object.create(null);
        var attributed = {};
        var catalogues = [];
        var orders = [];
        var picks = {};
        if (mode === 'replace') existing.forEach(function (source) {
            ['favorites:', 'recent:', 'recent-channels:', 'last-channel:', 'backup:', 'progress:', 'list-order:', 'channel-groups:', 'guide-pick:'].forEach(function (kind) { writes[kind + source.id] = null; });
        });
        backup.sources.forEach(function (entry, index) {
            var match = sources.filter(function (source) { return fingerprint(source) === fingerprint(entry.source); })[0];
            var id = 'backup-' + Date.now() + '-' + index;
            while (existing.concat(sources).some(function (source) { return source.id === id; })) id += '-new';
            var source = match || Object.assign({}, entry.source, { id: id });
            var guide = entry.browse && entry.browse.guide;
            // Guide links (#90) come with a new source; Merge keeps a matched source's own.
            if (guide && (!match || !GuideLinks.any(match))) {
                source = Object.assign({}, source, BackupOrder.guideFields(guide));
                if (match) sources[sources.indexOf(match)] = source;
                picks[source.id] = Object.assign({}, guide.picks, match && window.GuidePick ? GuidePick.all(match.id) : {});
            }
            if (!match) sources.push(source);
            sourceIds[entry.exportedId] = source.id;
            ['favorites', 'recent'].forEach(function (kind) {
                var key = kind + ':' + source.id;
                var saved = writes[key] || (mode === 'merge' ? read(key, {}) : {});
                writes[key] = lists(saved, entry[kind], kind);
            });
            var browse = entry.browse || { order: {}, groups: [] };
            // Orders wait for every source's new id: a channel order can name another source.
            orders.push({ key: 'list-order:' + source.id, incoming: browse.order });
            var groupsKey = 'channel-groups:' + source.id;
            var savedGroups = writes[groupsKey] || (mode === 'merge' ? read(groupsKey, null) : null);
            writes[groupsKey] = savedGroups ? BackupOrder.merge(savedGroups, browse.groups) : browse.groups;
            var channelsKey = 'recent-channels:' + source.id;
            var savedChannels = writes[channelsKey] || (mode === 'merge' ? read(channelsKey, []) : []);
            writes[channelsKey] = Library.mergeRecentChannels(savedChannels, entry.recentChannels || []);
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
        orders.forEach(function (order) {
            var incoming = BackupOrder.remapOrder(order.incoming, sourceIds);
            var saved = writes[order.key] || (mode === 'merge' ? read(order.key, null) : null);
            writes[order.key] = saved ? BackupOrder.merge(saved, incoming) : incoming;
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
        writes['audio-choice'] = AudioChoice.merge(mode === 'merge' ? read('audio-choice', null) : null, backup.audioChoice, sourceIds);
        // Guide picks (#90) are checked and rolled back with the rest.
        Object.keys(picks).forEach(function (id) {
            writes['guide-pick:' + id] = Object.keys(picks[id]).length ? picks[id] : null;
        });
        commit(writes, sources);
        // Raw playlists are catalogue data, never part of the localStorage library budget.
        return Promise.all(catalogues.map(function (catalogue) {
            return window.Catalogue ? Catalogue.put(catalogue.id, 'backup:m3u', { url: catalogue.url, text: catalogue.text }) : null;
        }));
    }

    return { read: read, fingerprint: fingerprint, apply: apply };
})();
