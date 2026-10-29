// Xtream Codes source, called directly from the TV (no proxy). Stream URLs
// follow IPTVnator's XtreamUrlService: {server}/{kind}/{user}/{pass}/{id}.{ext}
// with URL-encoded credentials.
// options.quiet keeps the log's secrets for the source in use (background checks).
window.XtreamSource = function (source, options) {
    'use strict';

    var enc = encodeURIComponent;
    var url = source.url.trim().replace(/\/+$/, '');
    var user = source.user.trim();
    var pass = source.pass.trim();
    if (!(options && options.quiet)) Log.setSecrets([user, pass, enc(user), enc(pass)]);

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
        return SourceRequest(request, 'json');
    }

    function streamUrl(kind, id, ext) {
        return url + '/' + kind + '/' + enc(user) + '/' + enc(pass) + '/' + id + '.' + ext;
    }

    function timeshiftUrl(id, minutes, start) {
        return url + '/timeshift/' + enc(user) + '/' + enc(pass) + '/' + minutes + '/' + start + '/' + id + '.ts';
    }

    // Movies and episodes: AVPlay first; HLS containers can use hls.js too.
    // AVPlay may also open the provider's .m3u8 or .ts address for the same
    // id, where the sound is often converted to one the TV plays (#54).
    function vodChain(src, ext, kind, id) {
        var avplay = { via: 'avplay', url: src };
        if (!/^(m3u8|ts)$/i.test(ext)) {
            avplay.converted = ['m3u8', 'ts'].map(function (name) { return { name: name, url: streamUrl(kind, id, name) }; });
        }
        var chain = [avplay];
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

    function programme(entry) {
        return {
            title: decode(entry.title),
            desc: decode(entry.description),
            start: Number(entry.start_timestamp) * 1000,
            end: Number(entry.stop_timestamp) * 1000,
        };
    }

    // "01:52:10" or seconds -> seconds.
    function seconds(info) {
        if (Number(info.duration_secs) > 0) return Number(info.duration_secs);
        var parts = String(info.duration || '').split(':').map(Number);
        if (parts.length !== 3 || parts.some(isNaN)) return 0;
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    // The few video facts subtitle ranking uses; providers send [] or nothing when unknown.
    function videoFacts(info) {
        var video = info && info.video;
        if (!video || typeof video !== 'object' || Array.isArray(video)) return undefined;
        return { width: video.width, height: video.height, codec_name: video.codec_name,
            r_frame_rate: video.r_frame_rate, avg_frame_rate: video.avg_frame_rate };
    }

    // The audio the provider's scan found (codec and channels), for the play log.
    function audioFacts(info) {
        var audio = info && info.audio;
        if (!audio || typeof audio !== 'object' || Array.isArray(audio)) return undefined;
        return { codec_name: audio.codec_name, profile: audio.profile, channels: audio.channels };
    }

    // Shared shape of get_vod_info / get_series_info `info` for the detail page.
    function details(info, item) {
        return {
            tmdb_id: info.tmdb_id || info.tmdb || item.tmdb_id || item.tmdb,
            imdb_id: info.imdb_id || info.imdb || item.imdb_id || item.imdb,
            title: info.name || item.name,
            poster: info.movie_image || info.cover_big || info.cover || item.stream_icon || item.cover || '',
            backdrop: first(info.backdrop_path),
            year: String(info.releasedate || info.releaseDate || info.release_date || item.year || '').slice(0, 4),
            rating: Number(info.rating) > 0 ? Number(info.rating) : 0,
            genre: info.genre || '',
            seconds: seconds(info),
            video: videoFacts(info),
            audio: audioFacts(info),
            plot: info.plot || info.description || '',
            cast: info.cast || info.actors || '',
            director: info.director || '',
            trailer: info.youtube_trailer || '',
        };
    }

    return {
        timeshiftUrl: timeshiftUrl,
        sections: ['live', 'movies', 'series'],
        movieInfo: function (movie) {
            return call('get_vod_info', { vod_id: movie.stream_id }).then(function (res) {
                return details((res && res.info) || {}, movie);
            });
        },
        nowNext: function (channel) {
            return call('get_short_epg', { stream_id: channel.stream_id, limit: 2 }).then(function (res) {
                return ((res && res.epg_listings) || [])
                    .map(programme)
                    .filter(function (p) {
                        return p.title && p.end > p.start;
                    });
            });
        },
        schedule: function (channel) {
            return call('get_simple_data_table', { stream_id: channel.stream_id }).then(function (res) {
                var now = Date.now();
                var listings = res && Array.isArray(res.epg_listings) ? res.epg_listings : [];
                var programmes = listings.filter(function (p) { return p && typeof p.title === 'string'; })
                    .map(programme).filter(function (p) {
                        return p.title.trim() && isFinite(p.start) && isFinite(p.end) && p.end > p.start &&
                            p.end > now - (window.CatchUp && CatchUp.available(channel) ? Math.min(7, CatchUp.days(channel)) * 86400000 : 3 * 3600000) &&
                            p.start < now + 26 * 3600000;
                    }).sort(function (a, b) { return a.start - b.start; });
                return programmes.length ? programmes : null;
            });
        },
        account: function () {
            return call('').then(function (res) {
                var info = res && res.user_info;
                var failure = SourceAccount.problem(info);
                if (failure) {
                    var err = new Error(failure.message);
                    err.code = 'account';
                    err.reason = failure.reason; // expired, inactive or login
                    err.expires = failure.expires;
                    err.info = info || null;
                    throw err;
                }
                info.server_info = res.server_info || {};
                return info;
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
                                video: videoFacts(info),
                                audio: audioFacts(info),
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
                // HLS starts in about 1.5 s on this TV and is the one route some
                // providers' redirects do not break; Samsung's player is about
                // as fast elsewhere. mpegts.js often waits for the 20 s timeout.
                sources: [
                    { via: 'hls', url: streamUrl('live', channel.stream_id, 'm3u8') },
                    { via: 'avplay', url: streamUrl('live', channel.stream_id, 'ts'), resolve: true },
                    { via: 'mpegts', url: streamUrl('live', channel.stream_id, 'ts') },
                ],
            };
        },
        movieRequest: function (movie) {
            var ext = movie.container_extension || 'mp4';
            var src = streamUrl('movie', movie.stream_id, ext);
            return { live: false, id: Progress.id('movies', movie), title: movie.name, sources: vodChain(src, ext, 'movie', movie.stream_id) };
        },
        episodeRequest: function (show, episode) {
            var ext = episode.container_extension || 'mp4';
            var src = streamUrl('series', episode.id, ext);
            return {
                live: false,
                id: Progress.episodeId(episode),
                title: show.name,
                subtitle: episode.label,
                sources: vodChain(src, ext, 'series', episode.id),
            };
        },
    };
};
