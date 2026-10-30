// The text of the Wide picture and Info boxes in Movies and Series (#66):
// only what the list item already has, or TMDB data already in memory, so a
// box costs no request and no storage read.
window.BoxCards = (function () {
    'use strict';

    // Matches made this session only; checking the key would read storage.
    function saved(item, section) {
        return Tmdb.cached(item, section === 'series' ? 'tv' : 'movie');
    }

    // Out of 10, one decimal: "7.4", or ''.
    function score(item, tmdb) {
        var value = parseFloat(item.rating);
        if (!(value > 0) && parseFloat(item.rating_5based) > 0) value = parseFloat(item.rating_5based) * 2;
        if (!(value > 0) && tmdb) value = parseFloat(tmdb.vote_average);
        return value > 0 ? String(Math.round(value * 10) / 10) : '';
    }

    // A film's length from TMDB when the list item has none (#73).
    function length(item, tmdb) {
        var minutes = parseInt(item.episode_run_time, 10);
        if (!(minutes > 0) && item.duration_secs) minutes = Math.round(item.duration_secs / 60);
        if (!(minutes > 0) && tmdb) minutes = parseInt(tmdb.runtime, 10);
        if (!(minutes > 0)) return '';
        var h = Math.floor(minutes / 60);
        return I18n.t(h ? 'unit.hoursMinutes' : 'unit.minutesOnly', { h: h, m: minutes % 60 });
    }

    function year(item, tmdb) {
        var found = Tmdb.year(item) || String(item.releaseDate || item.releasedate || '').slice(0, 4);
        if (!found && tmdb) found = String(tmdb.release_date || tmdb.first_air_date || '').slice(0, 4);
        return /^\d{4}$/.test(found) ? found : '';
    }

    // A show's seasons (#73): the provider's, when its episodes are already
    // loaded (`show`), else TMDB's count; 0 when neither is known.
    function seasons(show, tmdb) {
        var found = [];
        ((show && show.episodes) || []).forEach(function (ep) {
            if (found.indexOf(ep.season) === -1) found.push(ep.season);
        });
        if (found.length) return found.length;
        var count = parseInt(tmdb && tmdb.number_of_seasons, 10);
        return count > 0 ? count : 0;
    }

    return {
        plot: function (item, section) {
            var text = item.plot || item.description;
            if (!text) {
                var tmdb = saved(item, section);
                text = tmdb && tmdb.overview;
            }
            return text ? String(text) : '';
        },
        // A collection's own line as `sub`, else the year, the score out of
        // 10 ("7.4"), the length and, for a show, "3 seasons", each placed by
        // the box (#69, #73). `show` is the show's info already in memory.
        facts: function (item, section, show) {
            if (item.sub) return { sub: item.sub };
            var tmdb = saved(item, section);
            var count = section === 'series' ? seasons(show, tmdb) : 0;
            return {
                year: year(item, tmdb),
                score: score(item, tmdb),
                length: length(item, section === 'movies' ? tmdb : null),
                seasons: count ? I18n.t(count === 1 ? 'unit.season' : 'unit.seasons', { n: count }) : '',
            };
        },
    };
})();
