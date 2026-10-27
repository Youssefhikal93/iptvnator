// Search everything (#31): one query over Live TV, Movies and Series, with
// the results in rows like Home's (a Home without a banner draws them).
// Genre pills under the box narrow the results, or list a genre on their
// own. It owns the box, the pills and the focus between them and the rows;
// the browser supplies the items and opens what is picked.
//
// api: sections() -> the sections the source has, in order
//      title(section) -> the row title for a section
//      items(section) -> Promise of the section's items, without hidden or
//      locked ones
//      home -> the Home api the result rows use (open, progress, ...)
//      changed() -> after each redraw (the hints follow the focus)
window.Find = (api) => {
    'use strict';

    const KEY = Keys;
    const { html } = UI;
    const root = document.getElementById('find');
    const ROW_MAX = 60;
    const PILL_MAX = 16;
    let s = { query: '', rows: [], zone: 'box', typing: false, busy: false, token: 0, timer: null, active: false, genres: null, genre: null, pill: 0 };

    UI.render(html`<div class="fd-box"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg><input autocomplete="off" /></div>
        <div class="fd-pills"></div><div class="fd-status"></div><div class="fd-rows"></div>`, root);
    const box = root.querySelector('.fd-box');
    const input = root.querySelector('input');
    const pills = root.querySelector('.fd-pills');
    const status = root.querySelector('.fd-status');
    const rows = Home(Object.assign({}, api.home, { hero: () => [], rows: () => s.rows }), { root: root.querySelector('.fd-rows'), layout: 'cinema', empty: null });

    // ---- Genres -----------------------------------------------------------

    // Providers copy TMDB's genres, often in Arabic; both languages count
    // as one genre under its English name.
    const SAME = {
        'دراما': 'Drama', 'كوميديا': 'Comedy', 'حركة ومغامرة': 'Action & Adventure', 'رسوم متحركة': 'Animation',
        'جريمة': 'Crime', 'خيال علمي وفانتازيا': 'Sci-Fi & Fantasy', 'غموض': 'Mystery', 'عائلي': 'Family',
        'أطفال': 'Kids', 'وثائقي': 'Documentary', 'حرب وسياسة': 'War & Politics', 'واقع': 'Reality',
        'أوبرا صابونية': 'Soap', 'غربي': 'Western', 'حوار': 'Talk', 'أخبار': 'News', 'حركة': 'Action',
        'مغامرة': 'Adventure', 'رعب': 'Horror', 'إثارة': 'Thriller', 'رومانسي': 'Romance', 'خيال علمي': 'Science Fiction',
        'فانتازيا': 'Fantasy', 'تاريخ': 'History', 'موسيقى': 'Music', 'حرب': 'War', 'فيلم تلفزيوني': 'TV Movie',
    };
    // Two layers for movies and series: the provider's genres and those of
    // the TMDB match, once TMDB has looked the title up.
    const tmdbGenres = (item, section) => {
        if (section === 'live' || !window.Tmdb || !Tmdb.enabled()) return [];
        const body = Tmdb.cached(item, section === 'movies' ? 'movie' : 'tv');
        return body && body.genres ? body.genres.map((g) => g.name) : [];
    };
    const genresOf = (item, section) => {
        const names = String(item.genre || '').split(/[,/|]/).concat(tmdbGenres(item, section))
            .map((name) => name.trim()).filter(Boolean).map((name) => SAME[name] || name);
        return names.filter((name, i) => names.indexOf(name) === i);
    };

    // The most common genres across the sections, once the lists are in.
    const loadGenres = () => {
        if (s.genres) return;
        s.genres = [];
        const sections = api.sections();
        Promise.all(sections.map((section) => api.items(section).catch(() => []))).then((lists) => {
            const counts = {};
            lists.forEach((list, i) => list.forEach((item) => genresOf(item, sections[i]).forEach((name) => { counts[name] = (counts[name] || 0) + 1; })));
            s.genres = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, PILL_MAX);
            render();
        });
    };

    // ---- Results ----------------------------------------------------------

    // Titles that start with the query come before those that contain it.
    const match = (list, needle) => {
        if (!needle) return list.slice(0, ROW_MAX);
        const starts = [];
        const contains = [];
        list.forEach((item) => {
            const at = String(item.name || '').toLowerCase().indexOf(needle);
            if (at === 0) starts.push(item);
            else if (at > 0) contains.push(item);
        });
        return starts.concat(contains).slice(0, ROW_MAX);
    };

    const run = () => {
        clearTimeout(s.timer);
        const query = input.value.trim();
        const genre = s.genre;
        const token = ++s.token;
        s.query = query;
        if (!query && !genre) {
            s.rows = [];
            s.busy = false;
            render();
            return Promise.resolve(0);
        }
        const needle = query.toLowerCase();
        s.busy = true;
        render();
        const row = (section, entries) => ({ id: 'find-' + section, title: api.title(section), entries, live: section === 'live' });
        return Promise.all(api.sections().map((section) => api.items(section)
            .then((list) => {
                const shown = genre ? list.filter((item) => genresOf(item, section).indexOf(genre) !== -1) : list;
                return row(section, match(shown, needle).map((item) => ({ item, section })));
            })
            .catch(() => row(section, []))))
            .then((found) => {
                if (token !== s.token) return 0;
                s.busy = false;
                s.rows = found.filter((r) => r.entries.length);
                rows.reset();
                render();
                return s.rows.length;
            });
    };

    // Results follow the typing after a short pause.
    input.addEventListener('input', () => {
        clearTimeout(s.timer);
        s.timer = setTimeout(run, 500);
    });

    // ---- Drawing ----------------------------------------------------------

    // 'All' and then the genres; the focused pill is kept in view.
    const pillNames = () => (s.genres && s.genres.length ? [null].concat(s.genres) : []);

    function render() {
        input.placeholder = I18n.t('find.placeholder');
        box.classList.toggle('focused', s.active && s.zone === 'box' && !s.typing);
        box.classList.toggle('typing', s.typing);
        const names = pillNames();
        UI.render(html`${names.map((name, i) => html`<${Kit.Pill} key=${name || ''} cls="tm-chip" label=${name || I18n.t('find.all')}
            selected=${name === s.genre} focused=${s.active && s.zone === 'pills' && i === s.pill} />`)}`, pills);
        const focused = pills.children[s.pill];
        if (s.zone === 'pills' && focused) {
            if (focused.offsetLeft + focused.offsetWidth > pills.scrollLeft + pills.clientWidth) pills.scrollLeft = focused.offsetLeft + focused.offsetWidth - pills.clientWidth;
            if (focused.offsetLeft < pills.scrollLeft) pills.scrollLeft = focused.offsetLeft;
        }
        const label = s.query ? s.query : s.genre;
        status.textContent = s.busy ? I18n.t('find.searching')
            : !label ? I18n.t('find.hint')
            : !s.rows.length ? I18n.t('empty.search.title', { query: label }) + ' · ' + I18n.t('empty.search.hint')
            : '';
        rows.setActive(s.active && s.zone === 'rows');
        if (api.changed) api.changed();
    }

    // ---- Keys -------------------------------------------------------------

    const startTyping = () => {
        s.typing = true;
        render();
        input.focus();
    };
    const stopTyping = () => {
        s.typing = false;
        input.blur();
        render();
    };
    const below = () => (pillNames().length ? 'pills' : s.rows.length ? 'rows' : 'box');

    const typingKey = (code) => {
        if (code === KEY.ENTER || code === KEY.IME_DONE || code === KEY.DOWN) {
            stopTyping();
            run().then((found) => {
                if (found) {
                    s.zone = 'rows';
                    render();
                }
            });
        } else if (code === KEY.RETURN || code === KEY.ESCAPE || code === KEY.IME_CANCEL) stopTyping();
        else return false;
        return true;
    };

    const pillKey = (code) => {
        const names = pillNames();
        if (code === KEY.LEFT && s.pill === 0) return 'left';
        if (code === KEY.LEFT) s.pill--;
        else if (code === KEY.RIGHT && s.pill < names.length - 1) s.pill++;
        else if (code === KEY.UP) s.zone = 'box';
        else if (code === KEY.DOWN && s.rows.length) s.zone = 'rows';
        else if (code === KEY.ENTER) {
            s.genre = names[s.pill] === s.genre ? null : names[s.pill];
            run();
        }
        render();
        return true;
    };

    // Returns true when the key was used, false for a key the box should
    // get while typing, or the edge the focus leaves by ('left' or 'up').
    const key = (code) => {
        if (s.typing) return typingKey(code);
        if (s.zone === 'pills') return pillKey(code);
        if (s.zone === 'box') {
            if (code === KEY.ENTER) startTyping();
            else if (code === KEY.DOWN) s.zone = below();
            else if (code === KEY.LEFT) return 'left';
            else if (code === KEY.UP) return 'up';
            render();
            return true;
        }
        const edge = rows.key(code);
        if (edge === 'up') s.zone = pillNames().length ? 'pills' : 'box';
        else if (edge === 'left') return 'left';
        render();
        return true;
    };

    return {
        render,
        key,
        typing: () => s.typing,
        // The result with the focus (OK and hold-OK act on it), or null.
        focused: () => (s.zone === 'rows' ? rows.focused() : null),
        setActive: (active) => {
            s.active = active;
            if (!active && s.typing) stopTyping();
            render();
        },
        // The box takes the focus when the screen opens.
        open: () => {
            s.zone = 'box';
            loadGenres();
            render();
        },
        // A new source starts with an empty search and its own genres.
        reset: () => {
            ++s.token;
            input.value = '';
            s = Object.assign(s, { query: '', rows: [], zone: 'box', busy: false, genres: null, genre: null, pill: 0 });
            rows.reset();
            render();
        },
    };
};
