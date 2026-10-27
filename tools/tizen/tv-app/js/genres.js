// A title's genres in layers (#31): what the provider's list says, what
// the title's own page said once it was opened or looked up, and what its
// TMDB match says once TMDB has looked the title up. Providers copy
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

    // TMDB's genre names, so the pills are the same in both sections even
    // when the lists carry none.
    const STANDARD = {
        movies: ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy',
            'History', 'Horror', 'Music', 'Mystery', 'Romance', 'Science Fiction', 'Thriller', 'War', 'Western'],
        series: ['Action & Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Kids',
            'Mystery', 'Reality', 'Sci-Fi & Fantasy', 'Soap', 'War & Politics', 'Western'],
    };

    // The title's own page (set by the browser): a genre string or ''.
    let page = () => '';
    const usePage = (lookup) => {
        page = lookup;
    };

    const tmdb = (item, section) => {
        if (!window.Tmdb || !Tmdb.enabled()) return [];
        const body = Tmdb.cached(item, section === 'movies' ? 'movie' : 'tv');
        return body && body.genres ? body.genres.map((genre) => genre.name) : [];
    };

    // section is 'movies' or 'series'.
    const of = (item, section) => {
        const names = String(item.genre || '').split(/[,/|]/).concat(String(page(item, section) || '').split(/[,/|]/), tmdb(item, section))
            .map((name) => name.trim()).filter(Boolean).map((name) => SAME[name] || name);
        return names.filter((name, i) => names.indexOf(name) === i);
    };

    const has = (item, section, genre) => of(item, section).indexOf(genre) !== -1;
    const known = (item, section) => of(item, section).length > 0;

    // A search word that names a genre ("drama", "دراما", "sci"): matches
    // titles whose known genres start with it. Channels have none.
    const matches = (item, section, query) => {
        const word = String(query || '').trim();
        const needle = (SAME[word] || word).toLowerCase();
        if (section === 'live' || needle.length < 3) return false;
        return of(item, section).some((name) => name.toLowerCase().indexOf(needle) === 0);
    };

    // The most common genres in a list, most common first.
    const common = (list, section, max) => {
        const counts = {};
        list.forEach((item) => of(item, section).forEach((name) => { counts[name] = (counts[name] || 0) + 1; }));
        return Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, max);
    };

    // The pills: the list's most common genres, then the standard ones.
    const pills = (list, section, max) => {
        const top = common(list, section, max);
        return top.concat((STANDARD[section] || []).filter((name) => top.indexOf(name) === -1)).slice(0, max);
    };

    return { of, has, known, matches, common, pills, usePage };
})();
