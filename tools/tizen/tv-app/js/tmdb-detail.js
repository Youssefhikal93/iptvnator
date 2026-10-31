window.TmdbDetail = function (page, changed) {
    'use strict';

    var cast = [];
    var similar = [];
    var similarCredits = [];
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

    return {
        load: function (provider) {
            var lookup = Object.assign({}, page.item, { year: provider.year || page.item.year, tmdb_id: provider.tmdb_id || page.item.tmdb_id || page.item.tmdb });
            var type = page.episodes ? 'tv' : 'movie';
            Tmdb.match(lookup, type).then(function (body) {
                if (body) Tmdb.remember(page.item, type, lookup);
                if (!current() || !body) return;
                var enriched = Object.assign({}, provider);
                enriched.tmdb_id = body.id;
                enriched.title = body.title || body.name || provider.title;
                // Sizes match what is drawn: a 300 px poster, 154 px cast photos.
                enriched.poster = Tmdb.image(body.poster_path, 'w342') || provider.poster;
                enriched.backdrop = Tmdb.image(body.backdrop_path, 'w1280') || provider.backdrop;
                enriched.plot = provider.plot || body.overview;
                enriched.rating = Number(body.vote_average) || provider.rating;
                enriched.genre = (body.genres || []).map(function (genre) { return genre.name; }).join(', ') || provider.genre;
                enriched.seconds = (body.runtime || (body.episode_run_time || [])[0]) * 60 || provider.seconds;
                // A show's season count, for its box (#91).
                if (type === 'tv' && body.number_of_seasons > 0) enriched.seasons = body.number_of_seasons;
                cast = ((body.credits || {}).cast || []).slice(0, 12);
                changed(enriched);
                findTrailer((body.videos || {}).results);
                page.catalogue().then(function (catalogue) {
                    if (!current()) return;
                    var type = page.episodes ? 'tv' : 'movie';
                    similarCredits = ((body.similar || {}).results || []).map(function (entry) { return Object.assign({}, entry, { media_type: type }); });
                    similar = Tmdb.inLibrary(similarCredits, catalogue).filter(function (entry) { return entry.item !== page.item && !Tmdb.pick(entry.item, [body]); });
                    if (page.similarFound) page.similarFound(BecauseRows.ordered(similar.filter(function (entry) { return entry.type === type; }), similarCredits));
                    changed();
                });
            });
        },
        dispose: function () { active = false; },
        // Cast and similar titles as detail rows (see detail-rows.js).
        rows: function () {
            if (!current()) return [];
            var list = [];
            if (cast.length) list.push({
                label: I18n.t('tmdb.cast'),
                cards: cast.map(function (person) { return { name: person.name, image: Tmdb.image(person.profile_path, 'w185') }; }),
                open: function (i) { Actor.open(cast[i], page); },
            });
            if (similar.length) list.push({
                label: I18n.t('tmdb.similar'),
                cards: similar.map(function (entry) { return TmdbLanguage.catalogueCard(entry, similarCredits); }),
                open: function (i) { page.open(similar[i].item, similar[i].type === 'movie' ? 'movies' : 'series'); },
            });
            return list;
        },
        trailer: function () { return current() && !!trailer; },
        openTrailer: function () {
            if (!current() || !trailer) return;
            YouTube.open(trailer);
        },
    };
};
