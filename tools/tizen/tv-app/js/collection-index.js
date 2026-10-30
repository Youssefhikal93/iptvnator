// What the collection look-up learnt for one source (#58), kept for good in
// the TMDB database so no film is looked up twice, even after a restart:
//   films: { filmKey: [collectionId, tmdbId] or 0 for a film in none }
//   collections: { id: { name, poster, parts: [{ id, title, year, poster }],
//                        fetched, language } or { none: true, fetched } }
//   recheck: { filmKey: true } films a Refresh (#67) asks about again
//   refreshAt: when the last Refresh began; older collections are asked again
window.CollectionIndex = function (sourceId) {
    'use strict';

    var KEY = 'collections|v1|' + sourceId;
    var SAVE_MS = 10000;
    var data = { films: {}, collections: {} };
    var version = 0;
    var saveTimer = null;
    var shelfCache = null;
    var ready = TmdbStore.get(KEY).then(function (record) {
        var body = record && record.body;
        if (body && body.films && body.collections) data = body;
        version++;
        return data;
    });

    function filmKey(item) {
        return String(item.stream_id || item.url || item.name);
    }

    function changed() {
        version++;
        if (saveTimer) return;
        saveTimer = setTimeout(save, SAVE_MS);
    }

    function save() {
        clearTimeout(saveTimer);
        saveTimer = null;
        return TmdbStore.keep(KEY, data);
    }

    // The collections with at least two of the provider's films, each with
    // its films by TMDB id; worked out once per list and change.
    function shelf(movies) {
        if (shelfCache && shelfCache.movies === movies && shelfCache.version === version) return shelfCache.list;
        var found = Object.create(null);
        movies.forEach(function (item) {
            var film = data.films[filmKey(item)];
            var info = film && data.collections[film[0]];
            if (!info || info.none) return;
            var entry = found[film[0]] || (found[film[0]] = { id: film[0], info: info, films: Object.create(null), count: 0 });
            if (entry.films[film[1]]) return;
            entry.films[film[1]] = item;
            entry.count++;
        });
        var list = Object.keys(found).map(function (id) { return found[id]; })
            .filter(function (entry) { return entry.count >= 2; })
            .sort(function (a, b) { return a.info.name.localeCompare(b.info.name); });
        shelfCache = { movies: movies, version: version, list: list };
        return list;
    }

    return {
        ready: function () { return ready; },
        filmKey: filmKey,
        film: function (item) { return data.films[filmKey(item)]; },
        // Still to be asked about: never asked, or marked by a Refresh.
        due: function (item) {
            var key = filmKey(item);
            return data.films[key] === undefined || !!(data.recheck && data.recheck[key]);
        },
        // Refresh (#67): every film and collection is asked about again; what
        // is known stays shown until a new answer replaces it.
        refresh: function () {
            data.recheck = Object.create(null);
            Object.keys(data.films).forEach(function (key) { data.recheck[key] = true; });
            data.refreshAt = Date.now();
            changed();
        },
        // Whether a collection is asked again because of a Refresh.
        forced: function (id) {
            var info = data.collections[id];
            return !!data.refreshAt && (!info || (info.fetched || 0) < data.refreshAt);
        },
        setFilm: function (item, collectionId, tmdbId) {
            var key = filmKey(item);
            data.films[key] = collectionId ? [collectionId, tmdbId] : 0;
            if (data.recheck) delete data.recheck[key];
            changed();
        },
        collection: function (id) { return data.collections[id]; },
        setCollection: function (id, info) {
            data.collections[id] = info;
            changed();
        },
        // Collections the films point at that are missing, old or in another language.
        stale: function (language, maxAge) {
            var wanted = Object.create(null);
            Object.keys(data.films).forEach(function (key) {
                var film = data.films[key];
                if (!film) return;
                var info = data.collections[film[0]];
                var refreshed = (info && info.fetched || 0) < (data.refreshAt || 0);
                if (!info || refreshed || (!info.none && (info.language !== language || Date.now() - info.fetched > maxAge))) wanted[film[0]] = true;
            });
            return Object.keys(wanted).map(Number);
        },
        shelf: shelf,
        save: save,
    };
};

// What is kept of TMDB's answer for /collection/{id}: its parts by release.
window.CollectionIndex.info = function (body) {
    'use strict';
    var parts = (body.parts || []).map(function (part) {
        // The original title stays so a film named in another language than
        // the app's still matches the provider's film.
        return { id: part.id, title: part.title || part.original_title || '', original: part.original_title || '', year: String(part.release_date || '').slice(0, 4), poster: part.poster_path || '' };
    }).sort(function (a, b) { return (a.year || '9999').localeCompare(b.year || '9999'); });
    return { name: body.name || '', poster: body.poster_path || '', parts: parts, fetched: Date.now(), language: TmdbLanguage.tag(I18n.language()) };
};
