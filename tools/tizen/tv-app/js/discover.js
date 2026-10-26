window.Discover = (function () {
    'use strict';

    var state = null;
    var root;
    var token = 0;

    function close() {
        token++;
        state = null;
        if (root) root.remove();
        root = null;
    }

    function render() {
        root.textContent = '';
        root.appendChild(TmdbView.el('h1', '', 'Discover'));
        var chips = TmdbView.el('div', 'tm-chips');
        state.genres.forEach(function (genre, i) {
            chips.appendChild(TmdbView.el('span', 'tm-chip' + (state.genre === i ? ' selected' : '') + (state.zone === 'chips' && state.chip === i ? ' focus' : ''), genre.name));
        });
        root.appendChild(chips);
        var start = state.all.length ? state.offset + 1 : 0;
        root.appendChild(TmdbView.el('p', '', 'Titles ' + start + '–' + Math.min(state.offset + 12, state.all.length) + ' of ' + state.all.length + ' · CH ▲▼: browse more titles'));
        root.appendChild(TmdbView.cards('In your library', state.entries.map(TmdbView.catalogueCard), state.zone === 'items' ? state.focus : -1));
        root.appendChild(TmdbView.el('p', '', state.loading ? 'Matching visible titles…' : state.genre < 0 ? 'Choose a genre with OK' : state.entries.length ? 'OK: detail page · Return: categories' : 'No matches on this page · CH ▼: next titles'));
        TmdbView.scroll(root);
    }

    function loadPage() {
        var mine = ++token;
        var screen = state;
        var genre = state.genres[state.genre];
        if (!genre) return render();
        state.entries = [];
        state.focus = 0;
        state.loading = true;
        var visible = state.all.slice(state.offset, state.offset + 12);
        render();
        var next = 0;
        function wanted() { return state === screen && mine === token && Tmdb.enabled(); }
        function matchNext() {
            if (!wanted() || next >= visible.length) return Promise.resolve();
            var entry = visible[next++];
            var cached = Tmdb.cached(entry.item, entry.type);
            return (cached ? Promise.resolve(cached) : Tmdb.match(entry.item, entry.type, wanted)).then(function (body) {
                if (!wanted()) return;
                if (body && (body.genres || []).some(function (found) { return found.id === genre.id; })) {
                    state.entries = visible.filter(function (candidate) { return candidate === entry || state.entries.indexOf(candidate) !== -1; });
                    render();
                }
                return matchNext();
            });
        }
        // Retiring a page stops starting lookups for titles that are no longer visible.
        Promise.all([matchNext(), matchNext(), matchNext()]).then(function () {
            if (state !== screen || mine !== token) return;
            state.loading = false;
            render();
        });
    }

    return {
        open: function (type, page) {
            close();
            root = TmdbView.el('section', 'tm-screen');
            root.id = 'discover';
            document.body.appendChild(root);
            state = { all: [], entries: [], genres: [], chip: 0, genre: -1, focus: 0, offset: 0, zone: 'chips', loading: true, page: page };
            var screen = state;
            render();
            Promise.all([Tmdb.request('/genre/' + type + '/list'), page.catalogue()]).then(function (answers) {
                if (state !== screen || !Tmdb.enabled()) return;
                state.genres = (answers[0] || {}).genres || [];
                state.all = answers[1].filter(function (entry) { return entry.type === type; });
                state.loading = false;
                render();
            });
        },
        close: close,
        isOpen: function () { return !!state; },
        key: function (code) {
            if (Keys.isBack(code)) return close(), true;
            if (code === Keys.CH_DOWN || code === Keys.CH_UP) {
                state.offset = Math.max(0, Math.min(Math.max(0, Math.ceil(state.all.length / 12) - 1) * 12, state.offset + (code === Keys.CH_DOWN ? 12 : -12)));
                loadPage();
            } else if (state.zone === 'chips') {
                if (code === Keys.LEFT) state.chip = Math.max(0, state.chip - 1);
                if (code === Keys.RIGHT) state.chip = Math.max(0, Math.min(state.genres.length - 1, state.chip + 1));
                if (code === Keys.ENTER && state.genres[state.chip]) {
                    state.genre = state.chip;
                    state.offset = 0;
                    loadPage();
                }
                if (code === Keys.DOWN && state.entries.length) state.zone = 'items';
            } else {
                if (code === Keys.UP) state.zone = 'chips';
                if (code === Keys.LEFT) state.focus = Math.max(0, state.focus - 1);
                if (code === Keys.RIGHT) state.focus = Math.max(0, Math.min(state.entries.length - 1, state.focus + 1));
                if (code === Keys.ENTER && state.entries[state.focus]) {
                    var entry = state.entries[state.focus];
                    state.page.open(entry.item, entry.type === 'movie' ? 'movies' : 'series');
                    return true;
                }
            }
            render();
            return true;
        },
    };
})();
