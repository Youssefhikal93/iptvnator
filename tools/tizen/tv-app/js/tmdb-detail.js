window.TmdbDetail = function (page, changed) {
    'use strict';

    var cast = [];
    var similar = [];
    var similarCredits = [];
    var row = 0;
    var focus = 0;
    var trailer = null;
    var active = true;
    var secret = Prefs.get('tmdbApiKey');

    function current() { return active && secret && secret === Prefs.get('tmdbApiKey'); }

    function findTrailer(videos) {
        var video = (videos || []).filter(function (entry) { return entry.site === 'YouTube' && entry.type === 'Trailer' && YouTube.videoId(entry.key); })[0];
        if (!video) return;
        YouTube.available(function (available) {
            if (!current() || !available) return;
            trailer = YouTube.videoId(video.key);
            changed();
        });
    }

    function rows() {
        var list = [];
        if (cast.length) list.push({ label: I18n.t('tmdb.cast'), entries: cast });
        if (similar.length) list.push({ label: I18n.t('tmdb.similar'), entries: similar });
        return list;
    }

    return {
        load: function (provider) {
            var lookup = Object.assign({}, page.item, { year: provider.year || page.item.year, tmdb_id: provider.tmdb_id || page.item.tmdb_id || page.item.tmdb });
            Tmdb.match(lookup, page.episodes ? 'tv' : 'movie').then(function (body) {
                if (!current() || !body) return;
                var enriched = Object.assign({}, provider);
                enriched.tmdb_id = body.id;
                enriched.title = body.title || body.name || provider.title;
                enriched.poster = Tmdb.image(body.poster_path, 'w500') || provider.poster;
                enriched.backdrop = Tmdb.image(body.backdrop_path, 'w1280') || provider.backdrop;
                enriched.plot = provider.plot || body.overview;
                enriched.rating = Number(body.vote_average) || provider.rating;
                enriched.genre = (body.genres || []).map(function (genre) { return genre.name; }).join(', ') || provider.genre;
                enriched.seconds = (body.runtime || (body.episode_run_time || [])[0]) * 60 || provider.seconds;
                cast = ((body.credits || {}).cast || []).slice(0, 12);
                changed(enriched);
                findTrailer((body.videos || {}).results);
                page.catalogue().then(function (catalogue) {
                    if (!current()) return;
                    var type = page.episodes ? 'tv' : 'movie';
                    similarCredits = ((body.similar || {}).results || []).map(function (entry) { return Object.assign({}, entry, { media_type: type }); });
                    similar = Tmdb.inLibrary(similarCredits, catalogue).filter(function (entry) { return entry.item !== page.item && !Tmdb.pick(entry.item, [body]); });
                    changed();
                });
            });
        },
        dispose: function () { active = false; },
        hasRows: function () { return current() && rows().length > 0; },
        render: function (focused) {
            var box = TmdbView.el('div', 'tm-detail-rows');
            if (!current()) return box;
            rows().forEach(function (entry, i) {
                var cards = entry.entries === cast ? cast.map(function (person) { return { name: person.name, image: Tmdb.image(person.profile_path, 'w500') }; }) : similar.map(function (entry) { return TmdbLanguage.catalogueCard(entry, similarCredits); });
                box.appendChild(TmdbView.cards(entry.label, cards, focused && i === row ? focus : -1));
            });
            if (focused) TmdbView.scroll(box);
            return box;
        },
        key: function (code) {
            var list = rows();
            if (code === Keys.UP || Keys.isBack(code)) {
                if (!row || Keys.isBack(code)) return row = 0, focus = 0, 'up';
                row--; focus = 0;
            } else if (code === Keys.DOWN) {
                if (row === list.length - 1) return 'down';
                row++; focus = 0;
            } else if (code === Keys.LEFT) focus = Math.max(0, focus - 1);
            else if (code === Keys.RIGHT) focus = Math.min(list[row].entries.length - 1, focus + 1);
            else if (code === Keys.ENTER) {
                if (list[row].entries === cast) Actor.open(cast[focus], page);
                else page.open(similar[focus].item, similar[focus].type === 'movie' ? 'movies' : 'series');
            }
        },
        trailer: function () { return current() && !!trailer; },
        openTrailer: function () {
            if (!current() || !trailer) return;
            YouTube.open(trailer);
        },
    };
};
