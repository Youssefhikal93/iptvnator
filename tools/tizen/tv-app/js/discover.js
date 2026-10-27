// Discover: pick a TMDB genre and see the library titles that belong to it,
// twelve at a time (CH▲/CH▼ pages).
window.Discover = (() => {
    'use strict';

    const { html } = UI;
    const PAGE = 12;
    let state = null;
    let root;
    let token = 0;

    const close = () => {
        token++;
        state = null;
        if (root) root.remove();
        root = null;
    };

    const view = () => {
        const start = state.all.length ? state.offset + 1 : 0;
        const hint = state.loading ? 'discover.matching' : state.genre < 0 ? 'discover.chooseGenre' : state.entries.length ? 'discover.hint' : 'discover.noMatches';
        return html`<h1>${I18n.t('browser.discover')}</h1>
            <div class="tm-chips">${state.genres.map((genre, i) => html`<${Kit.Pill} cls="tm-chip" label=${genre.name} selected=${state.genre === i} focused=${state.zone === 'chips' && state.chip === i} />`)}</div>
            <p>${I18n.t('discover.titles', { from: start, to: Math.min(state.offset + PAGE, state.all.length), total: state.all.length })}</p>
            <${Kit.Row} label=${I18n.t('tmdb.inLibrary')} tiles=${state.entries.map(TmdbView.catalogueCard)} focus=${state.zone === 'items' ? state.focus : -1} />
            <p>${I18n.t(hint)}</p>`;
    };

    const render = () => {
        UI.render(view(), root);
        TmdbView.scroll(root);
    };

    const loadPage = () => {
        const mine = ++token;
        const screen = state;
        const genre = state.genres[state.genre];
        if (!genre) return render();
        state.entries = [];
        state.focus = 0;
        state.loading = true;
        const visible = state.all.slice(state.offset, state.offset + PAGE);
        render();
        let next = 0;
        const wanted = () => state === screen && mine === token && Tmdb.enabled();
        const matchNext = () => {
            if (!wanted() || next >= visible.length) return Promise.resolve();
            const entry = visible[next++];
            const cached = Tmdb.cached(entry.item, entry.type);
            return (cached ? Promise.resolve(cached) : Tmdb.match(entry.item, entry.type, wanted)).then((body) => {
                if (!wanted()) return;
                if (body && (body.genres || []).some((found) => found.id === genre.id)) {
                    state.entries = visible.filter((candidate) => candidate === entry || state.entries.indexOf(candidate) !== -1);
                    render();
                }
                return matchNext();
            });
        };
        // Retiring a page stops starting lookups for titles that are no longer visible.
        Promise.all([matchNext(), matchNext(), matchNext()]).then(() => {
            if (state !== screen || mine !== token) return;
            state.loading = false;
            render();
        });
    };

    const chipsKey = (code) => {
        if (code === Keys.LEFT || code === Keys.RIGHT) {
            const moved = Focus.step(state.chip, state.genres.length, code, 'row');
            if (moved.index !== undefined) state.chip = moved.index;
        }
        if (code === Keys.ENTER && state.genres[state.chip]) {
            state.genre = state.chip;
            state.offset = 0;
            loadPage();
        }
        if (code === Keys.DOWN && state.entries.length) state.zone = 'items';
    };

    const itemsKey = (code) => {
        if (code === Keys.UP) state.zone = 'chips';
        if (code === Keys.LEFT || code === Keys.RIGHT) {
            const moved = Focus.step(state.focus, state.entries.length, code, 'row');
            if (moved.index !== undefined) state.focus = moved.index;
        }
        if (code === Keys.ENTER && state.entries[state.focus]) {
            const entry = state.entries[state.focus];
            state.page.open(entry.item, entry.type === 'movie' ? 'movies' : 'series');
            return true;
        }
        return false;
    };

    return {
        open: (type, page) => {
            close();
            root = TmdbView.el('section', 'tm-screen');
            root.id = 'discover';
            document.body.appendChild(root);
            state = { all: [], entries: [], genres: [], chip: 0, genre: -1, focus: 0, offset: 0, zone: 'chips', loading: true, page };
            const screen = state;
            render();
            Promise.all([Tmdb.request('/genre/' + type + '/list'), page.catalogue()]).then(([genres, catalogue]) => {
                if (state !== screen || !Tmdb.enabled()) return;
                state.genres = (genres || {}).genres || [];
                state.all = catalogue.filter((entry) => entry.type === type);
                state.loading = false;
                render();
            });
        },
        close,
        isOpen: () => !!state,
        key: (code) => {
            if (Keys.isBack(code)) return close(), true;
            if (code === Keys.CH_DOWN || code === Keys.CH_UP) {
                const last = Math.max(0, Math.ceil(state.all.length / PAGE) - 1) * PAGE;
                state.offset = Math.max(0, Math.min(last, state.offset + (code === Keys.CH_DOWN ? PAGE : -PAGE)));
                loadPage();
            } else if (state.zone === 'chips') chipsKey(code);
            else if (itemsKey(code)) return true;
            render();
            return true;
        },
    };
})();
