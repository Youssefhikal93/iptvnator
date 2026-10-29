// A snapshot belongs to a list change, never to a remote key or rendered row.
window.HideWatched = function (watched, section) {
    'use strict';

    var sources = Object.create(null);
    function keep(item) {
        var source = item.sourceId || '';
        if (!sources[source]) sources[source] = Progress.watchedIds(item.sourceId);
        return !watched.isWatched(item, section, sources[source]);
    }

    function filter(list) {
        return list.filter(keep);
    }

    function counts(rows, all, categoryItems) {
        var totals = Object.create(null);
        var remaining = filter(all);
        remaining.forEach(function (item) {
            // Xtream items carry category_id, M3U items their group.
            var id = HiddenCategories.categoryOf(item);
            totals[id] = (totals[id] || 0) + 1;
        });
        return rows.map(function (row) {
            var copy = Object.assign({}, row);
            var cached = !row.virtual && !row.all && categoryItems(row);
            copy.count = row.virtual ? filter(row.list()).length : row.all ? remaining.length : cached ? filter(cached).length : totals[String(row.category_id)] || 0;
            return copy;
        });
    }

    return { filter: filter, counts: counts };
};
