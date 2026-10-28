window.SubtitleContext = (function () {
    'use strict';

    function identity(context, details) {
        var item = context.item;
        var title = details.title || item.name || '';
        var year = details.year || item.year || (/\b(19\d{2}|20\d{2})\b/.exec(title) || [])[1];
        var info = { title: title.replace(/\s*\((19|20)\d{2}\)\s*$/, ''), year: year,
            tmdb_id: details.tmdb_id || item.tmdb_id || item.tmdb,
            imdb_id: details.imdb_id || details.imdb || item.imdb_id || item.imdb,
            video: (context.episode || {}).video || details.video };
        if (context.episode) {
            info.season = context.episode.season;
            info.episode = context.episode.num;
        }
        return info;
    }

    // Providers name a show "Love is blind, Habibi- الحب أعمى حبيبي"; TMDB's
    // English name (and a movie's IMDb id) find far more subtitles.
    function withTmdb(context, info) {
        if (!window.Tmdb || !Tmdb.enabled()) return Promise.resolve(info);
        var item = Object.assign({}, context.item, info.tmdb_id ? { tmdb_id: info.tmdb_id } : {});
        return Tmdb.match(item, context.episode ? 'tv' : 'movie').then(function (body) {
            if (!body) return info;
            var named = [body.title, body.name, body.original_title, body.original_name].filter(function (name) {
                return /[a-z]/i.test(name || '');
            })[0];
            return Object.assign({}, info, { tmdb_id: body.id || info.tmdb_id, title: named || info.title, providerTitle: info.title,
                imdb_id: info.imdb_id || body.imdb_id });
        }).catch(function () { return info; });
    }

    function attach(request, context) {
        request.subtitleId = context.sourceId + '|' + request.id;
        request.subtitleLookup = function () {
            var known = identity(context, context.details || {});
            var episode = context.episode;
            var found = known.tmdb_id || known.imdb_id || !context.catalogue ? Promise.resolve(known)
                : context.catalogue.load({ kind: episode ? 'show' : 'movie',
                    id: episode ? context.item.series_id : context.item.stream_id, item: context.item }).then(function (body) {
                    return identity(context, (episode ? body && body.details : body) || {});
                }).catch(function () { return known; });
            return found.then(function (info) { return withTmdb(context, info); });
        };
    }

    return { attach: attach };
})();
