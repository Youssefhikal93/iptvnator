// Favorites, recently watched and continue watching, kept per source in the
// TV's localStorage. Entries are small snapshots of the catalogue items, so
// they can be listed and played without loading the catalogue again.
window.Library = (function () {
    'use strict';

    var PREFIX = 'iptvnator-tv:';
    var PROGRESS_KEY = PREFIX + 'progress';
    var RECENT_MAX = 40;
    var FIELDS = ['name', 'num', 'stream_id', 'stream_icon', 'container_extension', 'series_id', 'cover', 'logo', 'url', 'group', 'label', 'category_id'];

    function read(key, fallback) {
        try {
            return JSON.parse(localStorage.getItem(key)) || fallback;
        } catch (e) {
            return fallback;
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
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

    function progress(id) {
        if (id === undefined || id === null) return null;
        var entry = read(PROGRESS_KEY, {})[String(id)];
        if (!entry || !(entry.duration > 0) || !(entry.position > 0)) return null;
        return { ratio: Math.min(1, entry.position / entry.duration), position: entry.position, updatedAt: entry.updatedAt || 0 };
    }

    // Progress ids as the player stores them: movie:<stream_id>, episode:<episode id>.
    function progressId(section, item) {
        if (item.episode) return 'episode:' + item.episode.id;
        if (section === 'movies' && item.stream_id !== undefined) return 'movie:' + item.stream_id;
        return item.progressId;
    }

    function unfinished(section, item) {
        var p = progress(progressId(section, item));
        return p && p.ratio < 0.95 ? p : null;
    }

    function isWatched(id) {
        var p = progress(id);
        return !!p && p.ratio >= 0.95;
    }

    function allWatched(episodes) {
        return !!episodes && episodes.length > 0 && episodes.every(function (ep) {
            return ep.id !== undefined && ep.id !== null && isWatched('episode:' + ep.id);
        });
    }

    function saveWatched(all, id, duration) {
        if (id === undefined || id === null) return;
        var saved = all[String(id)];
        var secs = Number(saved && saved.duration);
        if (!(secs > 0) || !isFinite(secs)) secs = Number(duration);
        // Unknown lengths still need valid full progress, as in the player.
        if (!(secs > 0) || !isFinite(secs)) secs = 1;
        all[String(id)] = { position: secs, duration: secs, updatedAt: Date.now() };
    }

    function markWatched(id, duration) {
        var all = read(PROGRESS_KEY, {});
        saveWatched(all, id, duration);
        write(PROGRESS_KEY, all);
    }

    function markUnwatched(id) {
        var all = read(PROGRESS_KEY, {});
        delete all[String(id)];
        write(PROGRESS_KEY, all);
    }

    function markEpisodesWatched(episodes) {
        var all = read(PROGRESS_KEY, {});
        episodes.forEach(function (ep) {
            if (ep.id !== undefined && ep.id !== null) saveWatched(all, 'episode:' + ep.id, ep.seconds);
        });
        write(PROGRESS_KEY, all);
    }

    function markEpisodesUnwatched(episodes) {
        var all = read(PROGRESS_KEY, {});
        episodes.forEach(function (ep) {
            if (ep.id !== undefined && ep.id !== null) delete all['episode:' + ep.id];
        });
        write(PROGRESS_KEY, all);
    }

    return {
        // Startup restore is on by default; false survives JSON storage.
        setting: function (name, enabled) {
            var settings = read(PREFIX + 'settings', { lastChannelOnStart: true });
            if (enabled !== undefined) {
                settings[name] = enabled;
                write(PREFIX + 'settings', settings);
            }
            return settings[name] === undefined && name === 'lastChannelOnStart' ? true : settings[name];
        },
        lastChannel: function (sourceId) {
            return read(PREFIX + 'last-channel:' + sourceId, null);
        },
        setLastChannel: function (sourceId, channel) {
            write(PREFIX + 'last-channel:' + sourceId, snapshot(channel));
        },
        keyOf: keyOf,
        progress: progress,
        progressId: progressId,
        isWatched: isWatched,
        allWatched: allWatched,
        markWatched: markWatched,
        markUnwatched: markUnwatched,
        markEpisodesWatched: markEpisodesWatched,
        markEpisodesUnwatched: markEpisodesUnwatched,
        favorites: function (sourceId, section) {
            return listOf('favorites', sourceId, section);
        },
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
        // Forgets the saved position, which also drops the item from Continue watching.
        clearProgress: markUnwatched,
        continueWatching: function (sourceId, section) {
            return listOf('recent', sourceId, section).filter(function (entry) {
                return unfinished(section, entry);
            });
        },
        unfinished: unfinished,
        view: function (section, fallback) {
            try {
                var saved = localStorage.getItem(PREFIX + 'view:' + section);
                return saved === 'grid' || saved === 'list' ? saved : fallback;
            } catch (e) {
                return fallback;
            }
        },
        setView: function (section, mode) {
            try {
                localStorage.setItem(PREFIX + 'view:' + section, mode);
            } catch (e) {
                // Kept for this session only.
            }
        },
    };
})();
