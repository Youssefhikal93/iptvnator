window.SubtitleContext = (function () {
    'use strict';

    function identity(context, details) {
        var item = context.item;
        var title = details.title || item.name || '';
        var year = details.year || item.year || (/\b(19\d{2}|20\d{2})\b/.exec(title) || [])[1];
        var info = { title: title.replace(/\s*\((19|20)\d{2}\)\s*$/, ''), year: year,
            tmdb_id: details.tmdb_id || item.tmdb_id || item.tmdb,
            imdb_id: details.imdb_id || details.imdb || item.imdb_id || item.imdb };
        if (context.episode) {
            info.season = context.episode.season;
            info.episode = context.episode.num;
        }
        return info;
    }

    function attach(request, context) {
        request.subtitleId = context.sourceId + '|' + request.id;
        request.subtitleLookup = function () {
            var known = identity(context, context.details || {});
            if (known.tmdb_id || known.imdb_id || !context.catalogue) return Promise.resolve(known);
            var episode = context.episode;
            return context.catalogue.load({ kind: episode ? 'show' : 'movie',
                id: episode ? context.item.series_id : context.item.stream_id, item: context.item }).then(function (body) {
                return identity(context, (episode ? body && body.details : body) || {});
            }).catch(function () { return known; });
        };
    }

    return { attach: attach };
})();
