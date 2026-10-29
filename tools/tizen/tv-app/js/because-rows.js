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
// wanted(sourceId) -> [{ section, item }] watched titles with no fresh list.
// rows(sourceId, keep) -> [{ section, title, items }] for Home; keep(section,
//   item) leaves out hidden and finished titles. Kept until invalidate().
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

    // The section's titles watched for a few minutes, latest first: movies,
    // or the shows of the episodes watched.
    function watchedTitles(sourceId, section) {
        var seen = {};
        var list = [];
        Library.recent(sourceId, section).forEach(function (entry) {
            var title = section === 'series' ? entry.show : entry;
            if (!title || seen[Library.keyOf(section, title)]) return;
            var id = section === 'series' ? entry.episode && Progress.episodeId(entry.episode) : Progress.id(section, entry);
            if (!id || !watchedLong(id, sourceId)) return;
            seen[Library.keyOf(section, title)] = true;
            list.push(title);
        });
        return list;
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

    // The latest watched title that has a saved list gives the row.
    function build(sourceId, keep) {
        var data = read(sourceId);
        return SECTIONS.map(function (section) {
            var titles = watchedTitles(sourceId, section);
            for (var i = 0; i < titles.length; i++) {
                var found = data[titleKey(section, titles[i])];
                if (!found) continue;
                var items = found.items.filter(function (item) { return keep(section, item); }).slice(0, SHOWN_MAX);
                return items.length >= SHOWN_MIN ? { section: section, title: titles[i], items: items } : null;
            }
            return null;
        }).filter(Boolean);
    }

    function rows(sourceId, keep) {
        var key = storeKey(sourceId);
        if (!built || built.key !== key) built = { key: key, rows: Tmdb.enabled() ? build(sourceId, keep) : [] };
        return built.rows;
    }

    return {
        save: save,
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
