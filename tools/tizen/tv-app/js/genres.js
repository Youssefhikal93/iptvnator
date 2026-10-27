// A title's genres in two layers (#31): what the provider lists and what
// its TMDB match says, once TMDB has looked the title up. Providers copy
// TMDB's genres, often in Arabic; both languages count as one genre under
// its English name.
window.Genres = (() => {
    'use strict';

    const SAME = {
        'دراما': 'Drama', 'كوميديا': 'Comedy', 'حركة ومغامرة': 'Action & Adventure', 'رسوم متحركة': 'Animation',
        'جريمة': 'Crime', 'خيال علمي وفانتازيا': 'Sci-Fi & Fantasy', 'غموض': 'Mystery', 'عائلي': 'Family',
        'أطفال': 'Kids', 'وثائقي': 'Documentary', 'حرب وسياسة': 'War & Politics', 'واقع': 'Reality',
        'أوبرا صابونية': 'Soap', 'غربي': 'Western', 'حوار': 'Talk', 'أخبار': 'News', 'حركة': 'Action',
        'مغامرة': 'Adventure', 'رعب': 'Horror', 'إثارة': 'Thriller', 'رومانسي': 'Romance', 'خيال علمي': 'Science Fiction',
        'فانتازيا': 'Fantasy', 'تاريخ': 'History', 'موسيقى': 'Music', 'حرب': 'War', 'فيلم تلفزيوني': 'TV Movie',
    };

    const tmdb = (item, section) => {
        if (!window.Tmdb || !Tmdb.enabled()) return [];
        const body = Tmdb.cached(item, section === 'movies' ? 'movie' : 'tv');
        return body && body.genres ? body.genres.map((genre) => genre.name) : [];
    };

    // section is 'movies' or 'series'.
    const of = (item, section) => {
        const names = String(item.genre || '').split(/[,/|]/).concat(tmdb(item, section))
            .map((name) => name.trim()).filter(Boolean).map((name) => SAME[name] || name);
        return names.filter((name, i) => names.indexOf(name) === i);
    };

    const has = (item, section, genre) => of(item, section).indexOf(genre) !== -1;

    // The most common genres in a list, most common first.
    const common = (list, section, max) => {
        const counts = {};
        list.forEach((item) => of(item, section).forEach((name) => { counts[name] = (counts[name] || 0) + 1; }));
        return Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, max);
    };

    return { of, has, common };
})();
