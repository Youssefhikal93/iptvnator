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

    return {
        sections: ['live', 'movies', 'series'],
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
        episodes: function (show) {
            return call('get_series_info', { series_id: show.series_id }).then(function (info) {
                var seasons = (info && info.episodes) || {};
                var episodes = [];
                Object.keys(seasons)
                    .sort(function (a, b) {
                        return Number(a) - Number(b);
                    })
                    .forEach(function (season) {
                        (seasons[season] || []).forEach(function (ep) {
                            episodes.push({
                                id: ep.id,
                                container_extension: ep.container_extension,
                                label: 'S' + (ep.season || season) + ' E' + (ep.episode_num || '?') + '  ' + (ep.title || ''),
                            });
                        });
                    });
                return episodes;
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
            var src = streamUrl('movie', movie.stream_id, movie.container_extension || 'mp4');
            return { live: false, title: movie.name, sources: [{ via: 'avplay', url: src }, { via: 'video', url: src }] };
        },
        episodeRequest: function (show, episode) {
            var src = streamUrl('series', episode.id, episode.container_extension || 'mp4');
            return {
                live: false,
                title: show.name,
                subtitle: episode.label,
                sources: [{ via: 'avplay', url: src }, { via: 'video', url: src }],
            };
        },
    };
};
