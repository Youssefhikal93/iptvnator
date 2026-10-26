// Favorites, recently watched and continue watching, kept per source in the
// TV's localStorage. Entries are small snapshots of the catalogue items, so
// they can be listed and played without loading the catalogue again.
window.Library = (function () {
    'use strict';

    // ProfileStore adds the shared prefix and the profile segment.
    var PREFIX = '';
    var RECENT_MAX = 40;
    var FIELDS = ['name', 'num', 'stream_id', 'stream_icon', 'container_extension', 'series_id', 'cover', 'logo', 'url', 'group', 'label', 'category_id', 'added', 'last_modified', 'rating_5based', 'rating'];

    function read(key, fallback) {
        try {
            return JSON.parse(localStorage.getItem(ProfileStore.key(key))) || fallback;
        } catch (e) {
            return fallback;
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(ProfileStore.key(key), JSON.stringify(value));
        } catch (e) {
            // Kept for this session only.
        }
    }

    function snapshot(item) {
        var copy = {};
        FIELDS.forEach(function (field) {
            if (item[field] !== undefined && item[field] !== '') copy[field] = item[field];
        });
        return copy;
    }

    // Identity of an entry inside one section.
    function keyOf(section, item) {
        if (item.episode) return 'e' + item.episode.id;
        if (section === 'series') return String(item.series_id);
        return String(item.stream_id !== undefined ? item.stream_id : item.url);
    }

    function listOf(kind, sourceId, section) {
        return read(PREFIX + kind + ':' + sourceId, {})[section] || [];
    }

    function save(kind, sourceId, section, list) {
        var key = PREFIX + kind + ':' + sourceId;
        var all = read(key, {});
        all[section] = list;
        write(key, all);
    }

    function without(list, section, item) {
        var key = keyOf(section, item);
        return list.filter(function (entry) {
            return keyOf(section, entry) !== key;
        });
    }

    // Older favorites lack sort fields; use the catalogue and its provider order
    // where available, retaining snapshots for items the source no longer lists.
    function favoriteItems(sourceId, section, catalogue) {
        var saved = listOf('favorites', sourceId, section);
        var wanted = {};
        saved.forEach(function (item) {
            wanted[keyOf(section, item)] = true;
        });
        var matched = catalogue.filter(function (item) {
            var key = keyOf(section, item);
            if (!wanted[key]) return false;
            delete wanted[key];
            return true;
        });
        return matched.concat(saved.filter(function (item) {
            return wanted[keyOf(section, item)];
        }));
    }

    return {
        lastChannel: function (sourceId) {
            return read(PREFIX + 'last-channel:' + sourceId, null);
        },
        setLastChannel: function (sourceId, channel) {
            write(PREFIX + 'last-channel:' + sourceId, snapshot(channel));
        },
        keyOf: keyOf,
        favorites: function (sourceId, section) {
            return listOf('favorites', sourceId, section);
        },
        favoriteItems: favoriteItems,
        isFavorite: function (sourceId, section, item) {
            return listOf('favorites', sourceId, section).some(function (entry) {
                return keyOf(section, entry) === keyOf(section, item);
            });
        },
        // Returns true when the item is now a favorite.
        toggleFavorite: function (sourceId, section, item) {
            var list = listOf('favorites', sourceId, section);
            var rest = without(list, section, item);
            var added = rest.length === list.length;
            save('favorites', sourceId, section, added ? [snapshot(item)].concat(list) : rest);
            return added;
        },
        recent: function (sourceId, section) {
            return listOf('recent', sourceId, section);
        },
        // Most recent first. An episode entry carries its show and episode.
        addRecent: function (sourceId, section, item, show, episode) {
            var entry = snapshot(item);
            if (episode) {
                entry = snapshot(show);
                entry.episode = { id: episode.id, container_extension: episode.container_extension, label: episode.label };
                entry.show = snapshot(show);
                entry.label = show.name + ' · ' + String(episode.label || '').replace(/\s+/g, ' ').trim();
            }
            entry.watchedAt = Date.now();
            var list = without(listOf('recent', sourceId, section), section, entry);
            save('recent', sourceId, section, [entry].concat(list).slice(0, RECENT_MAX));
        },
        isRecent: function (sourceId, section, item) {
            var key = keyOf(section, item);
            return listOf('recent', sourceId, section).some(function (entry) {
                return keyOf(section, entry) === key;
            });
        },
        removeRecent: function (sourceId, section, item) {
            save('recent', sourceId, section, without(listOf('recent', sourceId, section), section, item));
        },
        continueWatching: function (sourceId, section) {
            return listOf('recent', sourceId, section).filter(function (entry) {
                return Progress.unfinished(section, entry);
            });
        },
        sort: function (sourceId, section) {
            var saved = read(PREFIX + 'sort:' + sourceId, {})[section];
            return Sort.options.some(function (option) {
                return option.id === saved;
            }) ? saved : section === 'movies' || section === 'series' ? Prefs.get('sort:' + section) : 'provider';
        },
        setSort: function (sourceId, section, mode) {
            var key = PREFIX + 'sort:' + sourceId;
            var all = read(key, {});
            all[section] = mode;
            write(key, all);
        },
        view: function (section, fallback) {
            var saved = Prefs.get('view:' + section);
            return saved === 'grid' || saved === 'list' ? saved : fallback;
        },
        setView: function (section, mode) {
            Prefs.set('view:' + section, mode);
        },
    };
})();
