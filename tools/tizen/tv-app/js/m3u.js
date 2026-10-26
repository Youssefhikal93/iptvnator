// M3U playlist source: downloaded and parsed on the TV. Groups
// (group-title / #EXTGRP) become categories. Entries that look like movies or
// episodes (see M3uVod) get Movies and Series sections; the rest is Live TV.
window.M3uSource = function (source) {
    'use strict';

    var parsed = null;

    function attr(line, name) {
        var match = new RegExp(name + '="([^"]*)"', 'i').exec(line);
        return match ? match[1].trim() : '';
    }

    // Items of one section by group, in playlist order.
    function grouped(list) {
        var groups = {};
        var order = [];
        list.forEach(function (item) {
            if (!groups[item.group]) {
                groups[item.group] = [];
                order.push(item.group);
            }
            groups[item.group].push(item);
        });
        return { all: list, groups: groups, order: order };
    }

    function parse(text) {
        var entries = [];
        var pending = null;
        text.split(/\r?\n/).forEach(function (raw) {
            var line = raw.trim();
            if (!line) return;
            if (line.indexOf('#EXTINF') === 0) {
                // The title follows the first comma after the last quoted attribute.
                var tail = line.slice(line.lastIndexOf('"') + 1);
                var comma = tail.indexOf(',');
                pending = {
                    name: comma >= 0 ? tail.slice(comma + 1).trim() : '',
                    logo: attr(line, 'tvg-logo'),
                    tvg_id: attr(line, 'tvg-id'),
                    group: attr(line, 'group-title'),
                };
            } else if (line.indexOf('#EXTGRP:') === 0) {
                if (pending && !pending.group) pending.group = line.slice(8).trim();
            } else if (line.charAt(0) !== '#') {
                var channel = pending || {};
                channel.url = line;
                channel.name = channel.name || line;
                channel.group = channel.group || 'Other';
                entries.push(channel);
                pending = null;
            }
        });
        var vod = M3uVod.build(entries);
        return {
            live: grouped(vod.live),
            movies: grouped(vod.movies),
            series: grouped(vod.shows),
            episodesOf: vod.episodesOf,
            movieById: vod.movieById,
            episodeById: vod.episodeById,
        };
    }

    function details(title, poster, group, year) {
        return { title: title, poster: poster || '', backdrop: '', year: year, rating: 0, genre: group, seconds: 0, plot: '', cast: '', director: '', trailer: '' };
    }

    function load() {
        if (parsed) return Promise.resolve(parsed);
        return SourceRequest(source.url.trim(), 'text')
            .then(function (text) {
                if (text.indexOf('#EXTINF') === -1) throw new Error('not an M3U playlist');
                parsed = parse(text);
                // Movies and Series show in the rail only when the playlist has them.
                api.sections = ['live'].concat(parsed.movies.all.length ? ['movies'] : [], parsed.series.all.length ? ['series'] : []);
                return parsed;
            });
    }

    // Movies and episodes: AVPlay first, like Xtream VOD.
    function vodChain(url, ext) {
        var chain = [{ via: 'avplay', url: url }];
        if (/^m3u8$/i.test(ext)) chain.push({ via: 'hls', url: url });
        chain.push({ via: 'video', url: url });
        return chain;
    }

    function playbackChain(url) {
        if (/\.m3u8(\?|$)/i.test(url)) return [{ via: 'hls', url: url }, { via: 'avplay', url: url }];
        return [
            { via: 'mpegts', url: url },
            { via: 'hls', url: url },
            { via: 'avplay', url: url },
        ];
    }

    var api = {
        parse: parse,
        sections: ['live'],
        account: function () {
            return load().then(function (p) {
                return {
                    channels: p.live.all.length,
                    groups: p.live.order.length,
                    movies: p.movies.all.length,
                    shows: p.series.all.length,
                };
            });
        },
        categories: function (section) {
            return load().then(function (p) {
                var of = p[section];
                var rows = of.order.map(function (group) {
                    return { category_id: group, category_name: group, count: of.groups[group].length };
                });
                // Live TV keeps its all-channels row; movies and shows are browsed by group.
                return section === 'live' ? [{ category_id: '', category_name: 'All channels', count: of.all.length }].concat(rows) : rows;
            });
        },
        items: function (section, categoryId) {
            return load().then(function (p) {
                var of = p[section];
                return categoryId ? of.groups[categoryId] || [] : of.all;
            });
        },
        liveRequest: function (channel) {
            return { live: true, title: channel.num + '. ' + channel.name, sources: playbackChain(channel.url) };
        },
        // There is no provider information: the playlist's own name, logo and group.
        movieInfo: function (movie) {
            var year = /[(\[](\d{4})[)\]]/.exec(movie.name);
            return Promise.resolve(details(movie.name, movie.logo, movie.group, year ? year[1] : ''));
        },
        seriesInfo: function (show) {
            return load().then(function (p) {
                var episodes = (p.episodesOf[show.series_id] || []).map(function (ep) {
                    return Object.assign({}, ep);
                });
                return { details: details(show.name, show.logo, show.group, ''), episodes: episodes };
            });
        },
        movieRequest: function (movie) {
            var known = parsed && parsed.movieById[movie.stream_id];
            var url = movie.url || (known && known.url) || '';
            return { live: false, id: Progress.id('movies', movie), title: movie.name, sources: vodChain(url, movie.container_extension) };
        },
        episodeRequest: function (show, episode) {
            var known = parsed && parsed.episodeById[episode.id];
            var url = episode.url || (known && known.url) || '';
            return {
                live: false,
                id: Progress.episodeId(episode),
                title: show.name,
                subtitle: episode.label,
                sources: vodChain(url, episode.container_extension),
            };
        },
    };
    return api;
};
