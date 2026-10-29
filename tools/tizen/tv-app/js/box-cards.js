// The text of the Wide picture and Info boxes in Movies and Series (#66):
// only what the list item already has, or TMDB data already in memory, so a
// box costs no request and no storage read.
window.BoxCards = (function () {
    'use strict';

    // Matches made this session only; checking the key would read storage.
    function saved(item, section) {
        return Tmdb.cached(item, section === 'series' ? 'tv' : 'movie');
    }

    function rating(item, tmdb) {
        var value = parseFloat(item.rating);
        if (!(value > 0) && parseFloat(item.rating_5based) > 0) value = parseFloat(item.rating_5based) * 2;
        if (!(value > 0) && tmdb) value = parseFloat(tmdb.vote_average);
        return value > 0 ? '★ ' + (Math.round(value * 10) / 10) : '';
    }

    function length(item) {
        var minutes = parseInt(item.episode_run_time, 10);
        if (!(minutes > 0) && item.duration_secs) minutes = Math.round(item.duration_secs / 60);
        if (!(minutes > 0)) return '';
        var h = Math.floor(minutes / 60);
        return I18n.t(h ? 'unit.hoursMinutes' : 'unit.minutesOnly', { h: h, m: minutes % 60 });
    }

    function year(item, tmdb) {
        var found = Tmdb.year(item) || String(item.releaseDate || item.releasedate || '').slice(0, 4);
        if (!found && tmdb) found = String(tmdb.release_date || tmdb.first_air_date || '').slice(0, 4);
        return /^\d{4}$/.test(found) ? found : '';
    }

    return {
        // "2021 · ★ 7.4 · 1 h 52 min", or a collection's own line.
        meta: function (item, section) {
            if (item.sub) return item.sub;
            var tmdb = saved(item, section);
            return [year(item, tmdb), rating(item, tmdb), length(item)].filter(Boolean).join(' · ');
        },
        plot: function (item, section) {
            var text = item.plot || item.description;
            if (!text) {
                var tmdb = saved(item, section);
                text = tmdb && tmdb.overview;
            }
            return text ? String(text) : '';
        },
        // A series' own backdrop when the provider sends one, else the poster.
        picture: function (item) {
            var backdrop = item.backdrop_path;
            if (Array.isArray(backdrop)) backdrop = backdrop[0];
            return (typeof backdrop === 'string' && /^https?:/.test(backdrop) && backdrop) || item.stream_icon || item.cover || null;
        },
    };
})();
