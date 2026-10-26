// "New episodes" badge: a favorite or recently watched show whose catalogue
// date (get_series last_modified, seconds) is later than the last time the
// viewer watched or opened it. The last time comes from a small per-source
// store of opened shows, `seen:<source>` = { seriesId: ms }, and from the
// progress of the show's episodes in Recently watched, so shows watched
// before this store existed still work.
window.NewEpisodes = (function () {
    'use strict';

    var PREFIX = 'iptvnator-tv:';
    var indexed = { list: null, map: {} };

    function readSeen(sourceId) {
        try {
            var saved = JSON.parse(localStorage.getItem(PREFIX + 'seen:' + sourceId));
            return saved && typeof saved === 'object' ? saved : {};
        } catch (e) {
            return {};
        }
    }

    function showOf(item) {
        return item && item.show ? item.show : item;
    }

    function hasId(show) {
        return !!show && show.series_id !== undefined && show.series_id !== null;
    }

    // The current catalogue copy of a show: saved snapshots keep an old date.
    function fresh(show, list) {
        if (!list) return show;
        if (indexed.list !== list) {
            indexed = { list: list, map: {} };
            list.forEach(function (item) {
                if (hasId(item)) indexed.map[String(item.series_id)] = item;
            });
        }
        return indexed.map[String(show.series_id)] || show;
    }

    // Catalogue date in ms, or 0 when the provider gives none.
    function modifiedMs(show, list) {
        var seconds = Number(fresh(show, list).last_modified);
        return seconds > 0 && isFinite(seconds) ? seconds * 1000 : 0;
    }

    function sameShow(entry, show) {
        var other = showOf(entry);
        return hasId(other) && String(other.series_id) === String(show.series_id);
    }

    function isNew(sourceId, item, list) {
        var show = showOf(item);
        if (!hasId(show)) return false;
        var modified = modifiedMs(show, list);
        if (!modified) return false;
        var at = Number(readSeen(sourceId)[String(show.series_id)]) || 0;
        if (at >= modified) return false;
        var mine = Library.recent(sourceId, 'series').filter(function (entry) {
            return sameShow(entry, show);
        });
        if (!mine.length && !Library.isFavorite(sourceId, 'series', show)) return false;
        mine.forEach(function (entry) {
            var progress = entry.episode && Progress.of(Progress.episodeId(entry.episode));
            if (progress && progress.updatedAt > at) at = progress.updatedAt;
        });
        // Never watched or opened: there is nothing to be new since.
        return at > 0 && modified > at;
    }

    return {
        isNew: isNew,
        // The viewer has now seen what the show has. A provider clock ahead of
        // the TV's must still clear the badge, so the date counts too.
        markSeen: function (sourceId, item, list) {
            var show = showOf(item);
            if (!hasId(show)) return;
            var all = readSeen(sourceId);
            var key = String(show.series_id);
            var at = Math.max(Date.now(), modifiedMs(show, list));
            if (all[key] >= at) return;
            all[key] = at;
            try {
                localStorage.setItem(PREFIX + 'seen:' + sourceId, JSON.stringify(all));
            } catch (e) {
                // The badge may come back after a restart.
            }
        },
        // Favorite and recently watched shows with new episodes, newest first.
        entries: function (sourceId, list) {
            var seen = {};
            var found = [];
            Library.favorites(sourceId, 'series').concat(Library.recent(sourceId, 'series')).forEach(function (entry) {
                var show = showOf(entry);
                if (!hasId(show) || seen[String(show.series_id)]) return;
                seen[String(show.series_id)] = true;
                if (isNew(sourceId, show, list)) found.push(fresh(show, list));
            });
            return found.sort(function (a, b) {
                return modifiedMs(b, list) - modifiedMs(a, list);
            });
        },
        badge: function () {
            var node = document.createElement('span');
            node.className = 'new-badge';
            node.textContent = 'New episodes';
            return node;
        },
    };
})();
