// Films that belong together (#58): the Collections category under Movies and
// the collection row of a film's detail page. With a TMDB key the collections
// are TMDB's, found in the background (collection-lookup.js); without one
// they are guessed from the provider's film names (name-groups.js) and
// nothing is requested.
//
// A collection is { name, sub, parts: [{ title, year, poster, item }] }:
// item is the provider's film, or null when the provider does not have it.
//
// deps: sourceId() -> the open source
//       movies() -> the source's visible films, or null while not loaded
//       all() -> all of the source's films, hidden ones too
//       changed() -> the look-up found something or moved on
window.Collections = function (deps) {
    'use strict';

    var index = null;
    var indexFor = null;

    function current() {
        var id = deps.sourceId();
        if (!id) return null;
        if (indexFor !== id) {
            // Another source: its films are not the ones being looked up.
            CollectionLookup.stop();
            indexFor = id;
            index = CollectionIndex(id);
        }
        return index;
    }

    // The look-up's films while its source is open; another source stops it,
    // so that source's films never go into this source's index.
    function owned(id) {
        return function () {
            if (deps.sourceId() === id) return deps.movies();
            CollectionLookup.stop();
            return null;
        };
    }

    function lookupDeps(known) {
        return { index: known, movies: owned(indexFor), changed: deps.changed };
    }

    function start() {
        var known = current();
        if (known && Tmdb.enabled()) CollectionLookup.start(lookupDeps(known));
    }

    function icon(item) { return item.stream_icon || item.cover || ''; }

    function counted(parts) {
        var have = parts.filter(function (part) { return part.item; }).length;
        return I18n.t('collections.count', { n: parts.length, m: have });
    }

    // Parts the index has not tied to a film yet are matched by title and year.
    function tmdbParts(info, films, movies) {
        var credits = info.parts.map(function (part) { return { id: part.id, title: part.title, original_title: part.original, release_date: part.year, media_type: 'movie' }; });
        var loose = info.parts.some(function (part) { return !films[part.id]; });
        var matched = loose ? Tmdb.inLibrary(credits, movies.map(function (item) { return { item: item, type: 'movie' }; })) : [];
        return info.parts.map(function (part) {
            var item = films[part.id] || (matched.filter(function (entry) { return Tmdb.pick(entry.item, [credits[info.parts.indexOf(part)]]); })[0] || {}).item || null;
            return { id: part.id, title: part.title, year: part.year, poster: Tmdb.image(part.poster, 'w342') || (item ? icon(item) : ''), item: item };
        });
    }

    // Groups come from every film, so hiding categories never turns a common
    // word into a collection; only the visible films are shown.
    function named(group, shown) {
        var parts = group.items.filter(function (item) { return shown.has(item); }).map(function (item) {
            return { title: item.name, year: Tmdb.year(item), poster: icon(item), item: item };
        });
        return { name: group.name, label: I18n.t('collections.ofName', { name: group.name }), sub: I18n.t('collections.films', { n: parts.length }), parts: parts };
    }

    var namedCache = null;
    function namedGroups(movies) {
        var all = deps.all() || movies;
        if (namedCache && namedCache.movies === movies && namedCache.all === all) return namedCache.list;
        var shown = new Set(movies);
        var list = NameGroups.groups(all).map(function (group) { return named(group, shown); })
            .filter(function (found) { return found.parts.length >= 2; });
        namedCache = { movies: movies, all: all, list: list };
        return list;
    }

    // The Collections category's tiles, as list items.
    function shelf() {
        var movies = deps.movies();
        if (!movies) return [];
        var list;
        if (!Tmdb.enabled()) list = namedGroups(movies);
        else list = current().shelf(movies).map(function (entry) {
            var parts = tmdbParts(entry.info, entry.films, []);
            return { name: entry.info.name, label: entry.info.name, sub: counted(parts), poster: Tmdb.image(entry.info.poster, 'w342'), parts: parts, entry: entry };
        });
        return list.map(function (found) {
            return { name: found.name, cover: found.poster || (found.parts[0] && found.parts[0].poster) || '', sub: found.sub, collection: found };
        });
    }

    return {
        start: start,
        // Asks TMDB about every film again in the background (#67).
        refresh: function () {
            var known = current();
            if (known && Tmdb.enabled()) CollectionLookup.refresh(lookupDeps(known));
        },
        // The Collections row for the category list, or null when there is none.
        row: function () {
            var list = shelf();
            var progress = Tmdb.enabled() ? CollectionLookup.progress() : null;
            if (!list.length && !progress) return null;
            return {
                category_id: '__collections',
                category_name: I18n.t('collections.title'),
                virtual: 'collections',
                count: list.length,
                list: function () { return list; },
                get empty() { return [I18n.t('collections.finding'), I18n.t('collections.findingHint')]; },
                sort: function () { return null; },
                fromCatalogue: true,
            };
        },
        // "Finding collections… x of y" while the look-up runs.
        progress: function () {
            var progress = Tmdb.enabled() ? CollectionLookup.progress() : null;
            return progress ? I18n.t('collections.progress', progress) : '';
        },
        // An opened collection's films as list items; films the provider
        // lacks are greyed out (missing).
        parts: function (found) {
            var movies = deps.movies() || [];
            var parts = found.entry ? tmdbParts(found.entry.info, found.entry.films, movies) : found.parts;
            return parts.map(function (part) {
                return part.item || { name: part.title, cover: part.poster, year: part.year, missing: true };
            });
        },
        // The collection of a film's detail page, or null. `body` is the
        // film's TMDB details when there is a key; entries() is a promise of
        // the catalogue as Tmdb.inLibrary takes it.
        forFilm: function (item, body, entries) {
            var movies = deps.movies() || [];
            if (!body) {
                var group = Tmdb.enabled() ? null : NameGroups.of(item, deps.all() || movies);
                if (!group) return Promise.resolve(null);
                var local = named(group, new Set(movies));
                if (local.parts.length < 2) return Promise.resolve(null);
                local.parts.forEach(function (part) { part.current = part.item.stream_id === item.stream_id; });
                return Promise.resolve(local);
            }
            var id = body.belongs_to_collection && body.belongs_to_collection.id;
            var known = current();
            if (!id || !known) return Promise.resolve(null);
            known.setFilm(item, id, body.id);
            var saved = known.collection(id);
            var info = saved && saved.parts ? Promise.resolve(saved) : Tmdb.collection(id).then(function (result) {
                if (result.status !== 'found') return null;
                var fresh = CollectionIndex.info(result.body);
                known.setCollection(id, fresh);
                return fresh;
            });
            return Promise.all([info, entries()]).then(function (both) {
                var found = both[0];
                if (!found || found.parts.length < 2) return null;
                var films = Object.create(null);
                films[body.id] = item;
                var parts = tmdbParts(found, films, both[1].filter(function (entry) { return entry.type === 'movie'; }).map(function (entry) { return entry.item; }));
                parts.forEach(function (part) { part.current = part.id === body.id; });
                return { name: found.name, label: found.name, sub: counted(parts), parts: parts };
            });
        },
    };
};
