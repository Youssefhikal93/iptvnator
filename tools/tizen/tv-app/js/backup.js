// Version 1 desktop manifests, with a TV extension for state v1 cannot express.
window.Backup = (function () {
    'use strict';

    var KIND = 'iptvnator-playlist-backup';
    var SECTIONS = ['live', 'movies', 'series'];
    var TYPES = { live: 'live', movie: 'movies', series: 'series' };

    function invalid() { throw new Error('Invalid backup file. Export a version 1 playlist backup from IPTVnator.'); }
    function text(value) { return typeof value === 'string' && value.length > 0; }
    function numeric(value) { return typeof value === 'number' && isFinite(value) && value >= 0; }
    function timestamp(value) { return typeof value === 'number' ? value : Date.parse(value) || 0; }
    function emptyLists() { return { live: [], movies: [], series: [] }; }
    function m3uText(raw) { return text(raw) && /(^|\n)\s*#EXT(?:M3U|INF)/.test(raw); }

    function address(value) {
        if (!text(value)) return invalid();
        try {
            var parsed = new URL(value);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return value;
        } catch (error) { /* Report no part of a credential-bearing address. */ }
        return invalid();
    }

    function record(position, duration, updatedAt) {
        if (!numeric(position) || !numeric(duration)) return invalid();
        return { position: Progress.finished(position, duration) ? duration : position, duration: duration, updatedAt: timestamp(updatedAt) };
    }

    function tvProgress(saved) {
        var progress = Object.create(null);
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return invalid();
        Object.keys(saved).forEach(function (key) {
            if (!/^(movie|episode):[a-zA-Z0-9:]+$/.test(key) || !saved[key]) return invalid();
            progress[key] = record(saved[key].position, saved[key].duration, saved[key].updatedAt);
        });
        return progress;
    }

    function tvItem(saved) {
        if (!saved || typeof saved !== 'object') return invalid();
        var copy = {};
        ['name', 'num', 'stream_id', 'stream_icon', 'container_extension', 'series_id', 'cover', 'logo', 'url', 'group', 'label', 'category_id', 'watchedAt'].forEach(function (field) {
            if (typeof saved[field] === 'string' || typeof saved[field] === 'number') copy[field] = saved[field];
        });
        if (saved.episode) {
            if (!text(String(saved.episode.id || ''))) return invalid();
            copy.episode = { id: saved.episode.id, label: String(saved.episode.label || ''), container_extension: String(saved.episode.container_extension || 'mp4') };
            if (saved.show) copy.show = tvItem(saved.show);
        }
        if (copy.stream_id === undefined && copy.series_id === undefined && !copy.url && !copy.episode) return invalid();
        return copy;
    }

    function tvLists(saved) {
        var lists = emptyLists();
        if (!saved || typeof saved !== 'object') return invalid();
        SECTIONS.forEach(function (section) {
            if (!Array.isArray(saved[section])) return invalid();
            lists[section] = saved[section].map(tvItem);
        });
        return lists;
    }

    function xtreamItem(reference, snapshots) {
        if (!reference || !Object.prototype.hasOwnProperty.call(TYPES, reference.contentType) || !numeric(reference.xtreamId)) return invalid();
        var snapshot = reference.snapshot || reference.collectionItem || snapshots.filter(function (entry) {
            return entry && entry.type === reference.contentType && entry.xtream_id === reference.xtreamId;
        })[0] || {};
        var title = snapshot.title || snapshot.name || 'Saved ' + reference.contentType + ' ' + reference.xtreamId;
        var item = { name: String(title), stream_icon: snapshot.posterUrl || snapshot.poster_url || snapshot.stream_icon || snapshot.cover || '', container_extension: snapshot.container_extension || 'mp4' };
        if (reference.contentType === 'series') { item.series_id = reference.xtreamId; item.cover = item.stream_icon; }
        else item.stream_id = reference.xtreamId;
        if (reference.viewedAt !== undefined) item.watchedAt = timestamp(reference.viewedAt);
        return item;
    }

    function parseXtream(entry, target) {
        var state = entry.userState;
        ['hiddenCategories', 'favorites', 'recentlyViewed', 'playbackPositions'].forEach(function (key) { if (!Array.isArray(state[key])) invalid(); });
        var snapshots = (Array.isArray(state.collectionItems) ? state.collectionItems : []).slice();
        state.favorites.forEach(function (favorite) {
            if (favorite && favorite.snapshot) snapshots.push(Object.assign({}, favorite.snapshot, { type: favorite.contentType, xtream_id: favorite.xtreamId }));
        });
        state.favorites.forEach(function (favorite) { target.favorites[TYPES[favorite && favorite.contentType] || 'live'].push(xtreamItem(favorite, snapshots)); });
        state.recentlyViewed.forEach(function (view) { target.recent[TYPES[view && view.contentType] || 'live'].push(xtreamItem(view, snapshots)); });
        state.playbackPositions.forEach(function (position) {
            if (!position || !numeric(position.contentXtreamId) || ['vod', 'episode'].indexOf(position.contentType) < 0) return invalid();
            var key = (position.contentType === 'vod' ? 'movie:' : 'episode:') + position.contentXtreamId;
            var saved = record(position.positionSeconds, position.durationSeconds === undefined ? 0 : position.durationSeconds, position.updatedAt);
            ['seriesXtreamId', 'seasonNumber', 'episodeNumber'].forEach(function (field) {
                if (position[field] !== undefined) { if (!numeric(position[field])) invalid(); saved[field] = position[field]; }
            });
            target.progress[key] = saved;
            if (position.contentType === 'episode' && numeric(position.seriesXtreamId)) {
                var show = xtreamItem({ contentType: 'series', xtreamId: position.seriesXtreamId }, snapshots);
                target.recent.series.push(Object.assign({}, show, { show: show, watchedAt: saved.updatedAt,
                    episode: { id: position.contentXtreamId, container_extension: 'mp4', label: 'S' + (position.seasonNumber || 1) + ' E' + (position.episodeNumber || 1) } }));
            }
        });
    }

    function parse(desktopJson) {
        var manifest;
        try { manifest = typeof desktopJson === 'string' ? JSON.parse(desktopJson) : desktopJson; } catch (error) { return invalid(); }
        if (!manifest || manifest.kind !== KIND || manifest.version !== 1 || !Array.isArray(manifest.playlists)) return invalid();
        var backup = { sources: [], skipped: 0, progress: Object.create(null) };
        manifest.playlists.forEach(function (entry) {
            if (!entry || !text(entry.exportedId) || !text(entry.title) || !entry.userState) return invalid();
            if (entry.portalType === 'stalker' || entry.portalType === 'm3u' && entry.source && ['file', 'text'].indexOf(entry.source.kind) >= 0) { backup.skipped++; return; }
            var target = { source: { type: entry.portalType, name: entry.title }, favorites: emptyLists(), recent: emptyLists(), progress: Object.create(null) };
            if (entry.portalType === 'xtream') {
                if (!entry.connection || !text(entry.connection.username) || entry.connection.password !== undefined && typeof entry.connection.password !== 'string') return invalid();
                target.source.url = address(entry.connection.serverUrl);
                target.source.user = entry.connection.username;
                target.source.pass = entry.connection.password || '';
                parseXtream(entry, target);
            } else if (entry.portalType === 'm3u') {
                if (!entry.source || entry.source.kind !== 'url' || !m3uText(entry.source.rawM3u)) return invalid();
                target.source.url = address(entry.source.url);
                if (!Array.isArray(entry.userState.favorites) || !Array.isArray(entry.userState.recentlyViewed)) return invalid();
                BackupM3u.parse(entry, target);
                if (entry.tvState) { target.favorites = tvLists(entry.tvState.favorites); target.recent = tvLists(entry.tvState.recent); }
            } else return invalid();
            backup.sources.push(target);
        });
        if (manifest.playlists.length && !backup.sources.length) throw new Error('No supported sources. Use an Xtream or M3U playlist link backup.');
        if (manifest.tvState) backup.progress = tvProgress(manifest.tvState.progress);
        return backup;
    }

    function sourceState(source) {
        var state = { favorites: emptyLists(), recent: emptyLists() };
        ['favorites', 'recent'].forEach(function (kind) {
            var stored = BackupStore.read(kind + ':' + source.id, {});
            SECTIONS.forEach(function (section) {
                var entries = stored[section] || [];
                if (!Array.isArray(entries)) throw new Error('Could not read the library.');
                state[kind][section] = entries;
            });
        });
        return state;
    }

    function recentTitles(views) {
        var newest = Object.create(null);
        views.forEach(function (view) {
            var key = view.contentType + ':' + view.xtreamId;
            if (!newest[key] || timestamp(view.viewedAt) > timestamp(newest[key].viewedAt)) newest[key] = view;
        });
        return Object.keys(newest).map(function (key) { return newest[key]; });
    }

    function buildXtream(source, state, progress, metadata) {
        var userState = { hiddenCategories: [], favorites: [], recentlyViewed: [], playbackPositions: [] };
        var ids = (metadata.progressIds || []).slice();
        SECTIONS.forEach(function (section) {
            var type = section === 'movies' ? 'movie' : section;
            ['favorites', 'recent'].forEach(function (kind) {
                state[kind][section].forEach(function (item) {
                    var id = Number(section === 'series' ? item.series_id : item.stream_id);
                    if (!numeric(id)) return;
                    var reference = { contentType: type, xtreamId: id };
                    if (kind === 'favorites') { reference.snapshot = { title: item.name || 'Saved item', posterUrl: item.cover || item.stream_icon || '' }; userState.favorites.push(reference); }
                    else { reference.viewedAt = new Date(item.watchedAt || 0).toISOString(); userState.recentlyViewed.push(reference); }
                    var progressId = Progress.id(section, item);
                    if (progressId && ids.indexOf(progressId) < 0) ids.push(progressId);
                });
            });
        });
        ids.forEach(function (key) {
            var saved = progress[key];
            var parts = /^(movie|episode):(\d+)$/.exec(key);
            if (!saved || !parts) return;
            var position = { contentXtreamId: Number(parts[2]), contentType: parts[1] === 'movie' ? 'vod' : 'episode', playlistId: source.id,
                positionSeconds: Progress.finished(saved.position, saved.duration) ? saved.duration : saved.position,
                durationSeconds: saved.duration, updatedAt: new Date(saved.updatedAt || 0).toISOString() };
            ['seriesXtreamId', 'seasonNumber', 'episodeNumber'].forEach(function (field) { if (saved[field] !== undefined) position[field] = saved[field]; });
            userState.playbackPositions.push(position);
        });
        userState.recentlyViewed = recentTitles(userState.recentlyViewed);
        return { portalType: 'xtream', exportedId: source.id, title: source.name, autoRefresh: false,
            connection: { serverUrl: source.url, username: source.user, password: source.pass || '' }, userState: userState };
    }

    function catalogueProgress(source, metadata, progress) {
        var saved = window.Catalogue ? Catalogue.entries(source.id) : Promise.resolve([]);
        return saved.then(function (entries) {
            var ids = (metadata.progressIds || []).slice();
            function remember(key) { if (progress[key] && ids.indexOf(key) < 0) ids.push(key); }
            (entries || []).forEach(function (entry) {
                if (entry.key.indexOf('movies:items:') === 0 && Array.isArray(entry.value)) {
                    entry.value.forEach(function (movie) { remember('movie:' + movie.stream_id); });
                }
                if (entry.key.indexOf('series:') === 0 && entry.value && Array.isArray(entry.value.episodes)) {
                    entry.value.episodes.forEach(function (episode) {
                        var key = Progress.episodeId(episode);
                        remember(key);
                        if (progress[key]) progress[key] = Object.assign({}, progress[key], { seriesXtreamId: Number(entry.key.slice(7)),
                            seasonNumber: Number(episode.season) || 1, episodeNumber: Number(episode.num) || 1 });
                    });
                }
            });
            return Object.assign({}, metadata, { progressIds: ids });
        });
    }

    function build() {
        return Promise.resolve().then(function () {
            var progress = BackupStore.read('progress', {});
            var sources = Sources.all();
            return Promise.all(sources.map(function (source) {
                var state = sourceState(source);
                var metadata = BackupStore.read('backup:' + source.id, {}) || {};
                if (source.type === 'xtream') return catalogueProgress(source, metadata, progress).then(function (known) { return buildXtream(source, state, progress, known); });
                var raw = window.Catalogue ? Catalogue.get(source.id, 'backup:m3u') : Promise.resolve(null);
                return raw.then(function (saved) {
                    return saved && saved.url === source.url ? saved.text : SourceRequest(source.url, 'text');
                }).then(function (text) {
                    if (!m3uText(text)) throw new Error('Could not export the M3U source.');
                    return BackupM3u.build(source, state, text);
                });
            })).then(function (playlists) {
                return { kind: KIND, version: 1, exportedAt: new Date().toISOString(), includeSecrets: true, playlists: playlists, tvState: { progress: progress } };
            });
        });
    }

    function summary(backup) {
        var favorites = 0;
        var positions = Object.assign({}, backup.progress);
        backup.sources.forEach(function (source) {
            SECTIONS.forEach(function (section) { favorites += source.favorites[section].length; });
            Object.assign(positions, source.progress);
        });
        return backup.sources.length + ' sources, ' + favorites + ' favorites, ' + Object.keys(positions).length + ' watch positions';
    }

    return { parse: parse, build: build, apply: BackupStore.apply, summary: summary };
})();
