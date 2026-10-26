// Desktop M3U state identifies favorites by URL; reuse the TV's VOD identity rules.
window.BackupM3u = (function () {
    'use strict';

    function find(url, catalogue) {
        var movie = catalogue.movies.all.filter(function (entry) { return entry.url === url; })[0];
        if (movie) return { section: 'movies', item: movie };
        var episode = Object.keys(catalogue.episodeById).map(function (id) { return catalogue.episodeById[id]; }).filter(function (entry) { return entry.url === url; })[0];
        if (episode) {
            var showId = Object.keys(catalogue.episodesOf).filter(function (id) { return catalogue.episodesOf[id].indexOf(episode) >= 0; })[0];
            return { section: 'series', item: catalogue.series.all.filter(function (show) { return show.series_id === showId; })[0], episode: episode };
        }
        var channel = catalogue.live.all.filter(function (entry) { return entry.url === url; })[0];
        return { section: 'live', item: channel || { url: url, name: 'Saved channel', group: 'Other' } };
    }

    function parse(entry, target) {
        var catalogue = M3uSource({}).parse(entry.source.rawM3u);
        target.rawM3u = entry.source.rawM3u;
        entry.userState.favorites.forEach(function (url) {
            if (typeof url !== 'string' || !url) throw new Error('Invalid backup: M3U favorite.');
            var found = find(url, catalogue);
            target.favorites[found.section].push(found.item);
        });
        entry.userState.recentlyViewed.forEach(function (view) {
            if (!view || view.source !== 'm3u' || typeof view.url !== 'string' || !view.url) throw new Error('Invalid backup: M3U recently watched.');
            var found = find(view.url, catalogue);
            found.item = Object.assign({}, found.item);
            if (found.episode) { found.item.show = Object.assign({}, found.item); found.item.episode = found.episode; }
            found.item.name = view.title || found.item.name;
            found.item.logo = view.poster_url || found.item.logo;
            found.item.watchedAt = typeof view.added_at === 'number' ? view.added_at : Date.parse(view.added_at) || 0;
            target.recent[found.section].push(found.item);
        });
    }

    function build(source, state, raw) {
        var favorites = [];
        var recent = [];
        var catalogue = M3uSource({}).parse(raw);
        ['live', 'movies', 'series'].forEach(function (section) {
            state.favorites[section].forEach(function (entry) {
                if (entry.url) favorites.push(entry.url);
                else (catalogue.episodesOf[entry.series_id] || []).forEach(function (episode) { favorites.push(episode.url); });
            });
            state.recent[section].forEach(function (entry) {
                var episode = entry.episode && catalogue.episodeById[entry.episode.id];
                var url = entry.url || episode && episode.url;
                if (!url) return;
                recent.push({ source: 'm3u', id: url, url: url, title: entry.name || 'Saved channel',
                    poster_url: entry.logo || '', group_title: entry.group || '', category_id: 'live', added_at: entry.watchedAt || 0 });
            });
        });
        return { portalType: 'm3u', exportedId: source.id, title: source.name, autoRefresh: false,
            source: { kind: 'url', url: source.url, rawM3u: raw },
            userState: { favorites: favorites, recentlyViewed: recent, hiddenGroupTitles: [] },
            tvState: { favorites: state.favorites, recent: state.recent } };
    }

    return { parse: parse, build: build };
})();
