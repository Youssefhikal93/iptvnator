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
        view: function (focused) {
            var html = UI.html;
            if (!current()) return html`<div class="tm-detail-rows"></div>`;
            return html`<div class="tm-detail-rows">${rows().map(function (entry, i) {
                var cards = entry.entries === cast ? cast.map(function (person) { return { name: person.name, image: Tmdb.image(person.profile_path, 'w500') }; }) : similar.map(function (entry) { return TmdbLanguage.catalogueCard(entry, similarCredits); });
                return html`<${Kit.Row} label=${entry.label} tiles=${cards} focus=${focused && i === row ? focus : -1} />`;
            })}</div>`;
        },
        key: function (code) {
            var list = rows();
            if (Keys.isBack(code)) return row = 0, focus = 0, 'up';
            if (code === Keys.ENTER) {
                if (list[row].entries === cast) Actor.open(cast[focus], page);
                else page.open(similar[focus].item, similar[focus].type === 'movie' ? 'movies' : 'series');
                return undefined;
            }
            if (code === Keys.UP || code === Keys.DOWN) {
                var line = Focus.step(row, list.length, code, 'column');
                if (line.exit === 'up') return row = 0, focus = 0, 'up';
                if (line.exit === 'down') return 'down';
                row = line.index;
                focus = 0;
                return undefined;
            }
            var moved = Focus.step(focus, list[row].entries.length, code, 'row');
            if (moved.index !== undefined) focus = moved.index;
            return undefined;
        },
        trailer: function () { return current() && !!trailer; },
        openTrailer: function () {
            if (!current() || !trailer) return;
            YouTube.open(trailer);
        },
    };
};
