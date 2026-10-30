// "Because you watched" rows on Home (#63): TMDB's similar titles for the
// latest movie and the latest show watched for a few minutes, only those the
// provider has. The titles are found away from Home (after playback and on
// a detail page) and saved per profile and source, so Home never waits for
// or asks TMDB (#53): it reads the saved lists once per build.
//
// save(sourceId, section, title, items) keeps the provider items found for a
//   title, best match first.
// ordered(found, credits) -> the items of Tmdb.inLibrary's entries in TMDB's
//   order of `credits`.
// mark(sourceId, section, title, ids) notes a title marked watched (#72): it
//   counts like one played to the end while any of `ids` is still watched,
//   so unmarking it needs no call.
// wanted(sourceId) -> [{ section, item }] watched titles with no fresh list.
// rows(sourceId, keep, shown) -> [{ section, title, items }] for Home;
//   keep(section, item) leaves out hidden and finished titles, shown(section,
//   title) leaves out a watched title the viewer may no longer see. Kept
//   until invalidate().
window.BecauseRows = (function () {
    'use strict';

    var SHOWN_MAX = 12;
    var SHOWN_MIN = 4;
    // A few spare titles, for the ones the viewer finishes later.
    var SAVED_MAX = 20;
    var TITLES_MAX = 20;
    var FRESH_MS = 7 * 24 * 3600 * 1000;
    // Watched for at least five minutes: a title left after seconds does not count.
    var WATCHED_S = 300;
    var SECTIONS = ['movies', 'series'];

    var saved = { key: null, data: null };
    var built = null;
    // Without a TMDB key there are no rows; asking for the key on every key
    // press would cost a storage read, so a key change rebuilds them instead.
    Prefs.onChange(function (name) {
        if (name === 'tmdbApiKey') built = null;
    });

    function storeKey(sourceId) {
        return ProfileStore.key('because:' + sourceId);
    }

    function markedKey(sourceId) {
        return ProfileStore.key('because-marked:' + sourceId);
    }

    function readMarked(sourceId) {
        try {
            var data = Stored.json(markedKey(sourceId));
            return data && typeof data === 'object' ? data : {};
        } catch (e) {
            return {};
        }
    }

    // A show keeps every episode marked, so unmarking one leaves the others.
    function mark(sourceId, section, title, ids) {
        var data = readMarked(sourceId);
        var own = titleKey(section, title);
        var before = data[own] && data[own].ids || [];
        delete data[own];
        data[own] = {
            at: Date.now(),
            title: Library.snapshot(title),
            ids: before.concat(ids.filter(function (id) { return id && before.indexOf(id) === -1; })),
        };
        var oldest = Object.keys(data).sort(function (a, b) { return data[a].at - data[b].at; });
        oldest.slice(0, Math.max(0, oldest.length - TITLES_MAX)).forEach(function (old) { delete data[old]; });
        built = null;
        try {
            Stored.save(markedKey(sourceId), data);
        } catch (e) {
            // Left out of the rows; playing the title still counts.
        }
    }

    function read(sourceId) {
        var key = storeKey(sourceId);
        if (saved.key !== key) {
            var data = null;
            try {
                data = Stored.json(key);
            } catch (e) {
                // Nothing saved yet.
            }
            saved = { key: key, data: data && typeof data === 'object' ? data : {} };
        }
        return saved.data;
    }

    function titleKey(section, item) {
        return section + ':' + Library.keyOf(section, item);
    }

    function save(sourceId, section, title, items) {
        var data = Object.assign({}, read(sourceId));
        var own = titleKey(section, title);
        // Saved last, so it is the newest of titles saved in the same moment.
        delete data[own];
        data[own] = {
            at: Date.now(),
            items: items.filter(function (item) { return titleKey(section, item) !== own; }).slice(0, SAVED_MAX).map(Library.snapshot),
        };
        var oldest = Object.keys(data).sort(function (a, b) { return data[a].at - data[b].at; });
        oldest.slice(0, Math.max(0, oldest.length - TITLES_MAX)).forEach(function (old) { delete data[old]; });
        saved = { key: storeKey(sourceId), data: data };
        built = null;
        try {
            Stored.save(saved.key, data);
        } catch (e) {
            // Kept for this session only.
        }
    }

    function ordered(found, credits) {
        var rank = function (entry) {
            for (var i = 0; i < credits.length; i++) if (Tmdb.pick(entry.item, [credits[i]])) return i;
            return credits.length;
        };
        return found.map(function (entry) { return { entry: entry, rank: rank(entry) }; })
            .sort(function (a, b) { return a.rank - b.rank; })
            .map(function (ranked) { return ranked.entry.item; });
    }

    function watchedLong(id, sourceId) {
        var p = Progress.of(id, sourceId);
        return !!p && (p.status === 'watched' || p.position >= WATCHED_S);
    }

    // The section's titles watched for a few minutes or marked watched, the
    // latest play or mark first: movies, or the shows of the episodes.
    function watchedTitles(sourceId, section) {
        var found = [];
        Library.recent(sourceId, section).forEach(function (entry) {
            var title = section === 'series' ? entry.show : entry;
            var id = section === 'series' ? entry.episode && Progress.episodeId(entry.episode) : Progress.id(section, entry);
            if (title && id && watchedLong(id, sourceId)) found.push({ title: title, at: entry.watchedAt || 0 });
        });
        var marked = readMarked(sourceId);
        var done = Progress.watchedIds(sourceId);
        Object.keys(marked).forEach(function (key) {
            var entry = marked[key];
            if (key.indexOf(section + ':') !== 0 || !entry || !entry.title) return;
            if ((entry.ids || []).some(function (id) { return done[id]; })) found.push({ title: entry.title, at: entry.at || 0 });
        });
        // The index keeps equal times in their order; older TVs sort unstably.
        found.forEach(function (entry, index) { entry.index = index; });
        found.sort(function (a, b) { return b.at - a.at || a.index - b.index; });
        var seen = {};
        return found.filter(function (entry) {
            var key = Library.keyOf(section, entry.title);
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        }).map(function (entry) { return entry.title; });
    }

    function fresh(found) {
        return !!found && Date.now() - found.at < FRESH_MS;
    }

    function wanted(sourceId) {
        var data = read(sourceId);
        return SECTIONS.map(function (section) {
            var title = watchedTitles(sourceId, section)[0];
            return title && !fresh(data[titleKey(section, title)]) ? { section: section, item: title } : null;
        }).filter(Boolean);
    }

    // The latest watched title that has a saved list gives the row; a title
    // the viewer may no longer see (locked, hidden, not for Kids) gives none.
    function build(sourceId, keep, shown) {
        var data = read(sourceId);
        return SECTIONS.map(function (section) {
            var titles = watchedTitles(sourceId, section);
            for (var i = 0; i < titles.length; i++) {
                var found = data[titleKey(section, titles[i])];
                if (!found || (shown && !shown(section, titles[i]))) continue;
                var items = found.items.filter(function (item) { return keep(section, item); }).slice(0, SHOWN_MAX);
                return items.length >= SHOWN_MIN ? { section: section, title: titles[i], items: items } : null;
            }
            return null;
        }).filter(Boolean);
    }

    function rows(sourceId, keep, shown) {
        var key = storeKey(sourceId);
        if (!built || built.key !== key) built = { key: key, rows: Tmdb.enabled() ? build(sourceId, keep, shown) : [] };
        return built.rows;
    }

    return {
        save: save,
        mark: mark,
        ordered: ordered,
        wanted: wanted,
        rows: rows,
        // Home calls this when it is built again, not on a key press.
        invalidate: function () {
            built = null;
            saved = { key: null, data: null };
        },
    };
})();
