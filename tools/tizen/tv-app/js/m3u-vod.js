// Sorts M3U entries into live channels, movies and shows. A playlist has no
// provider metadata, so the URL path (/movie/, /series/), the file extension,
// the group name and an "S01E02" style name are the only clues.
window.M3uVod = (function () {
    'use strict';

    var VOD_EXTENSION = /\.(mp4|mkv|avi|mov|wmv|flv|m4v|webm|mpg|mpeg)$/i;
    var MOVIE_GROUP = /\b(vod|movies?|films?|filmer|filme|cinema)\b/i;
    var SERIES_GROUP = /\b(series|serier|tv[\s_-]?shows?|shows|episodes?)\b/i;
    var EPISODE_NAME = [
        /^(.*?)[\s._-]*\bS(\d{1,3})[\s._-]*E(\d{1,4})(?!\d)[\s._:-]*(.*)$/i,
        /^(.*?)[\s._-]*\bSeason[\s._-]*(\d{1,3})[\s._,-]*Episode[\s._-]*(\d{1,4})(?!\d)[\s._:-]*(.*)$/i,
        /^(.*?)[\s._-]*\b(\d{1,2})x(\d{1,3})(?!\d)[\s._:-]*(.*)$/i,
    ];

    // Ids must stay the same on every download, so they come from the text.
    function hash(text) {
        var a = 5381;
        var b = 2166136261;
        for (var i = 0; i < text.length; i++) {
            var c = text.charCodeAt(i);
            a = ((a * 33) ^ c) >>> 0;
            b = Math.imul(b ^ c, 16777619) >>> 0;
        }
        return a.toString(36) + b.toString(36);
    }

    function pathOf(url) {
        return String(url).replace(/[?#].*$/, '');
    }

    function extensionOf(url) {
        var match = /\.([a-z0-9]{2,5})$/i.exec(pathOf(url));
        return match ? match[1].toLowerCase() : '';
    }

    // "Show S01E02 - Title", "Show 1x02", "Show - S01 E02" -> show, season, episode, title.
    function episode(name) {
        var text = String(name || '').trim();
        for (var i = 0; i < EPISODE_NAME.length; i++) {
            var match = EPISODE_NAME[i].exec(text);
            if (!match) continue;
            var show = match[1].replace(/[\s._:-]+$/, '');
            if (!show) continue;
            if (!/\s/.test(show)) show = show.replace(/[._]+/g, ' ');
            return { show: show, season: Number(match[2]), episode: Number(match[3]), title: match[4].trim() };
        }
        return null;
    }

    function classify(entry) {
        var path = pathOf(entry.url);
        if (/\/live\//i.test(path)) return 'live';
        if (/\/series\//i.test(path)) return 'series';
        if (/\/movie\//i.test(path)) return 'movie';
        var parsed = episode(entry.name);
        if (VOD_EXTENSION.test(path)) return parsed ? 'series' : 'movie';
        var group = entry.group || '';
        if (parsed && SERIES_GROUP.test(group)) return 'series';
        if (MOVIE_GROUP.test(group)) return 'movie';
        return 'live';
    }

    function movieOf(entry) {
        return {
            name: entry.name,
            stream_id: 'm3u:' + hash(entry.url),
            stream_icon: entry.logo,
            logo: entry.logo,
            url: entry.url,
            group: entry.group,
            category_id: entry.group,
            container_extension: extensionOf(entry.url),
        };
    }

    function byPosition(a, b) {
        return Number(a.season) - Number(b.season) || Number(a.num) - Number(b.num);
    }

    // Live channels are numbered among themselves. Show episodes come back in
    // season order; a /series/ link without a recognisable name becomes a
    // one-episode show so it still plays.
    function build(entries) {
        var out = { live: [], movies: [], shows: [], episodesOf: {}, movieById: {}, episodeById: {} };
        var seen = {};
        var showById = {};
        entries.forEach(function (entry) {
            var kind = classify(entry);
            if (kind === 'live') {
                entry.num = out.live.length + 1;
                out.live.push(entry);
                return;
            }
            if (seen[entry.url]) return;
            seen[entry.url] = true;
            if (kind === 'movie') {
                var movie = movieOf(entry);
                out.movies.push(movie);
                out.movieById[movie.stream_id] = movie;
                return;
            }
            var parsed = episode(entry.name);
            var name = parsed ? parsed.show : entry.name;
            var id = 'm3u:' + hash('show:' + name.toLowerCase().replace(/\s+/g, ' '));
            if (!showById[id]) {
                showById[id] = { name: name, series_id: id, cover: entry.logo, logo: entry.logo, group: entry.group, category_id: entry.group };
                out.shows.push(showById[id]);
                out.episodesOf[id] = [];
            }
            var list = out.episodesOf[id];
            if (!showById[id].cover) showById[id].cover = showById[id].logo = entry.logo;
            var season = parsed ? parsed.season : 1;
            var number = parsed ? parsed.episode : list.length + 1;
            var title = parsed ? parsed.title : entry.name;
            var ep = {
                id: 'm3u:' + hash(entry.url),
                container_extension: extensionOf(entry.url),
                season: String(season),
                num: String(number),
                title: title,
                label: 'S' + season + ' E' + number + '  ' + title,
                image: entry.logo,
                plot: '',
                seconds: 0,
                url: entry.url,
            };
            list.push(ep);
            out.episodeById[ep.id] = ep;
        });
        // Array.prototype.sort is stable, so equal numbers keep playlist order.
        Object.keys(out.episodesOf).forEach(function (id) {
            out.episodesOf[id].sort(byPosition);
        });
        return out;
    }

    return { classify: classify, episode: episode, hash: hash, build: build };
})();
