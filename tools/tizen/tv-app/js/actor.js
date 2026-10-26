window.Actor = (function () {
    'use strict';

    var state = null;
    var root;

    function close() {
        state = null;
        if (root) root.remove();
        root = null;
    }

    function render() {
        root.textContent = '';
        var person = state.person;
        var photo = Tmdb.image(person.profile_path, 'w500');
        if (photo) {
            var image = TmdbView.el('img', 'tm-person');
            image.src = photo;
            root.appendChild(image);
        }
        root.appendChild(TmdbView.el('h1', '', person.name));
        root.appendChild(TmdbView.el('p', 'tm-bio', (person.biography || '').slice(0, 900)));
        root.appendChild(TmdbView.cards('In your library', state.entries.map(TmdbView.catalogueCard), state.focus));
        root.appendChild(TmdbView.el('p', '', state.loading ? 'Loading…' : state.entries.length ? 'OK: open · Return: detail page' : 'No matching items in this source'));
        TmdbView.scroll(root);
    }

    return {
        open: function (person, page) {
            close();
            root = TmdbView.el('section', 'tm-screen');
            root.id = 'actor';
            document.body.appendChild(root);
            state = { person: person, entries: [], focus: 0, page: page, loading: true };
            var mine = state;
            render();
            Promise.all([Tmdb.request('/person/' + person.id, { append_to_response: 'combined_credits' }), page.catalogue()]).then(function (answers) {
                if (state !== mine || !Tmdb.enabled()) return;
                if (answers[0]) {
                    state.person = answers[0];
                    state.entries = Tmdb.inLibrary((answers[0].combined_credits || {}).cast || [], answers[1]);
                }
                state.loading = false;
                render();
            });
        },
        isOpen: function () { return !!state; },
        close: close,
        key: function (code) {
            if (Keys.isBack(code)) return close(), true;
            if (code === Keys.LEFT) state.focus = Math.max(0, state.focus - 1);
            if (code === Keys.RIGHT) state.focus = Math.max(0, Math.min(state.entries.length - 1, state.focus + 1));
            if (code === Keys.ENTER && state.entries[state.focus]) {
                var entry = state.entries[state.focus];
                var open = state.page.open;
                close();
                open(entry.item, entry.type === 'movie' ? 'movies' : 'series');
                return true;
            }
            render();
            return true;
        },
    };
})();
