// Merge snapshots only from saved sources; deleted sources may leave old keys.
window.LibraryAll = (function () {
    'use strict';

    function entries(kind, section, currentSourceId) {
        var sources = Sources.all();
        sources = sources.filter(function (source) { return source.id === currentSourceId; }).concat(
            sources.filter(function (source) { return source.id !== currentSourceId; })
        );
        var merged = [];
        sources.forEach(function (source) {
            Library[kind](source.id, section).forEach(function (item) {
                var entry = {};
                Object.keys(item).forEach(function (key) { entry[key] = item[key]; });
                entry.sourceId = source.id;
                entry.sourceName = source.name;
                merged.push(entry);
            });
        });
        return merged;
    }

    return {
        favorites: function (section, currentSourceId) {
            return entries('favorites', section, currentSourceId);
        },
        recent: function (section, currentSourceId) {
            // Explicit positions keep timestamp ties and legacy entries stable.
            return entries('recent', section, currentSourceId).map(function (entry, index) {
                return { entry: entry, index: index };
            }).sort(function (a, b) {
                return (b.entry.watchedAt || 0) - (a.entry.watchedAt || 0) || a.index - b.index;
            }).map(function (ranked) { return ranked.entry; });
        },
    };
})();
