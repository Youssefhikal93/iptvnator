// An actor's page from the Detail cast row: photo, biography and the
// titles of theirs that are in the library.
window.Actor = (() => {
    'use strict';

    const { html } = UI;
    let state = null;
    let root;

    const close = () => {
        state = null;
        if (root) root.remove();
        root = null;
    };

    const view = () => {
        const person = state.person;
        const photo = Tmdb.image(person.profile_path, 'h632');
        const hint = state.loading ? 'common.loadingEllipsis' : state.entries.length ? 'actor.hint' : 'actor.none';
        return html`${photo ? UI.img('tm-person', photo) : null}
            <h1>${person.name}</h1>
            <p class="tm-bio">${(person.biography || '').slice(0, 900)}</p>
            <${Kit.Row} label=${I18n.t('tmdb.inLibrary')} tiles=${state.entries.map(TmdbView.catalogueCard)} focus=${state.focus} />
            <p>${I18n.t(hint)}</p>`;
    };

    const render = () => {
        UI.render(view(), root);
        TmdbView.scroll(root);
    };

    return {
        open: (person, page) => {
            close();
            root = TmdbView.el('section', 'tm-screen');
            root.id = 'actor';
            document.body.appendChild(root);
            state = { person, entries: [], focus: 0, page, loading: true };
            const mine = state;
            render();
            Promise.all([Tmdb.request('/person/' + person.id, { append_to_response: 'combined_credits' }), page.catalogue()]).then(([found, catalogue]) => {
                if (state !== mine || !Tmdb.enabled()) return;
                if (found) {
                    state.person = found;
                    state.entries = Tmdb.inLibrary((found.combined_credits || {}).cast || [], catalogue);
                }
                state.loading = false;
                render();
            });
        },
        isOpen: () => !!state,
        close,
        key: (code) => {
            if (Keys.isBack(code)) return close(), true;
            if (code === Keys.LEFT || code === Keys.RIGHT) {
                const moved = Focus.step(state.focus, state.entries.length, code, 'row');
                if (moved.index !== undefined) state.focus = moved.index;
            }
            if (code === Keys.ENTER && state.entries[state.focus]) {
                const entry = state.entries[state.focus];
                const open = state.page.open;
                close();
                open(entry.item, entry.type === 'movie' ? 'movies' : 'series');
                return true;
            }
            render();
            return true;
        },
    };
})();
