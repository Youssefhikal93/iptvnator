// Xtream Codes source, called directly from the TV (no proxy). Stream URLs
// follow IPTVnator's XtreamUrlService: {server}/{kind}/{user}/{pass}/{id}.{ext}
// with URL-encoded credentials.
window.XtreamSource = function (source) {
    'use strict';

    var enc = encodeURIComponent;
    var url = source.url.trim().replace(/\/+$/, '');
    var user = source.user.trim();
    var pass = source.pass.trim();
    Log.setSecrets([user, pass, enc(user), enc(pass)]);

    var ACTIONS = {
        categories: { live: 'get_live_categories', movies: 'get_vod_categories', series: 'get_series_categories' },
        items: { live: 'get_live_streams', movies: 'get_vod_streams', series: 'get_series' },
    };

    function call(action, params) {
        var request = url + '/player_api.php?username=' + enc(user) + '&password=' + enc(pass);
        if (action) request += '&action=' + action;
        Object.keys(params || {}).forEach(function (key) {
            request += '&' + key + '=' + enc(params[key]);
        });
        return fetch(request).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        });
    }

    function streamUrl(kind, id, ext) {
        return url + '/' + kind + '/' + enc(user) + '/' + enc(pass) + '/' + id + '.' + ext;
    }

    // Movies and episodes: AVPlay first; HLS containers can use hls.js too.
    function vodChain(src, ext) {
        var chain = [{ via: 'avplay', url: src }];
        if (/^m3u8$/i.test(ext)) chain.push({ via: 'hls', url: src });
        chain.push({ via: 'video', url: src });
        return chain;
    }

    // Short EPG titles and descriptions are base64-encoded UTF-8.
    function decode(text) {
        try {
            var bytes = atob(text || '');
            var buf = new Uint8Array(bytes.length);
            for (var i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
            return new TextDecoder().decode(buf);
        } catch (e) {
            return text || '';
        }
    }

    function first(value) {
        return Array.isArray(value) ? value[0] || '' : value || '';
    }

    // "01:52:10" or seconds -> seconds.
    function seconds(info) {
        if (Number(info.duration_secs) > 0) return Number(info.duration_secs);
        var parts = String(info.duration || '').split(':').map(Number);
        if (parts.length !== 3 || parts.some(isNaN)) return 0;
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    // Shared shape of get_vod_info / get_series_info `info` for the detail page.
    function details(info, item) {
        return {
            title: info.name || item.name,
            poster: info.movie_image || info.cover_big || info.cover || item.stream_icon || item.cover || '',
            backdrop: first(info.backdrop_path),
            year: String(info.releasedate || info.releaseDate || info.release_date || item.year || '').slice(0, 4),
            rating: Number(info.rating) > 0 ? Number(info.rating) : 0,
            genre: info.genre || '',
            seconds: seconds(info),
            plot: info.plot || info.description || '',
            cast: info.cast || info.actors || '',
            director: info.director || '',
            trailer: info.youtube_trailer || '',
        };
    }

    return {
        sections: ['live', 'movies', 'series'],
        movieInfo: function (movie) {
            return call('get_vod_info', { vod_id: movie.stream_id }).then(function (res) {
                return details((res && res.info) || {}, movie);
            });
        },
        nowNext: function (channel) {
            return call('get_short_epg', { stream_id: channel.stream_id, limit: 2 }).then(function (res) {
                return ((res && res.epg_listings) || [])
                    .map(function (p) {
                        return {
                            title: decode(p.title),
                            desc: decode(p.description),
                            start: Number(p.start_timestamp) * 1000,
                            end: Number(p.stop_timestamp) * 1000,
                        };
                    })
                    .filter(function (p) {
                        return p.title && p.end > p.start;
                    });
            });
        },
        account: function () {
            return call('').then(function (res) {
                if (!res.user_info || String(res.user_info.auth) !== '1') {
                    throw new Error('the server rejected this login');
                }
                return res.user_info;
            });
        },
        categories: function (section) {
            return call(ACTIONS.categories[section]).then(function (list) {
                list = Array.isArray(list) ? list : [];
                return section === 'live' ? [{ category_id: '', category_name: 'All channels' }].concat(list) : list;
            });
        },
        items: function (section, categoryId) {
            return call(ACTIONS.items[section], categoryId ? { category_id: categoryId } : {}).then(function (list) {
                return Array.isArray(list) ? list : [];
            });
        },
        // The show's details and all its episodes, in season order.
        seriesInfo: function (show) {
            return call('get_series_info', { series_id: show.series_id }).then(function (res) {
                var seasons = (res && res.episodes) || {};
                var episodes = [];
                Object.keys(seasons)
                    .sort(function (a, b) {
                        return Number(a) - Number(b);
                    })
                    .forEach(function (season) {
                        (seasons[season] || []).forEach(function (ep) {
                            var info = ep.info || {};
                            var number = ep.season || season;
                            episodes.push({
                                id: ep.id,
                                container_extension: ep.container_extension,
                                season: String(number),
                                num: String(ep.episode_num || '?'),
                                title: ep.title || '',
                                label: 'S' + number + ' E' + (ep.episode_num || '?') + '  ' + (ep.title || ''),
                                image: info.movie_image || info.cover_big || '',
                                plot: info.plot || '',
                                seconds: seconds(info),
                            });
                        });
                    });
                return { details: details((res && res.info) || {}, show), episodes: episodes };
            });
        },
        liveRequest: function (channel) {
            return {
                live: true,
                title: (channel.num ? channel.num + '. ' : '') + channel.name,
                sources: [
                    { via: 'mpegts', url: streamUrl('live', channel.stream_id, 'ts') },
                    { via: 'hls', url: streamUrl('live', channel.stream_id, 'm3u8') },
                    { via: 'avplay', url: streamUrl('live', channel.stream_id, 'ts') },
                ],
            };
        },
        movieRequest: function (movie) {
            var ext = movie.container_extension || 'mp4';
            var src = streamUrl('movie', movie.stream_id, ext);
            return { live: false, id: 'movie:' + movie.stream_id, title: movie.name, sources: vodChain(src, ext) };
        },
        episodeRequest: function (show, episode) {
            var ext = episode.container_extension || 'mp4';
            var src = streamUrl('series', episode.id, ext);
            return {
                live: false,
                id: 'episode:' + episode.id,
                title: show.name,
                subtitle: episode.label,
                sources: vodChain(src, ext),
            };
        },
    };
};
