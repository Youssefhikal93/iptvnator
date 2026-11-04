// The options sheet down the right (#48), opened by holding OK on an item.
// open(title, options, index, header, onBack) where header { image, sub }
// shows the item's artwork beside the title, and onBack runs when Return
// closes the menu.
// Options are { label, sub, glyph, icon, run, view }; glyph uses the shared
// text icon column, while icon supplies a custom view. view is drawn instead
// of the label (which still names the row for tests and logs); sub is a
// smaller line under the label. An option without run just closes the menu,
// and a { label, note: true } line is passed over by the focus.
// search(title, placeholder, build) opens a menu with a search field on top:
// build(text) gives the options for what is typed. Moving onto the field only
// highlights it; OK opens the keyboard, so the focus can pass it by.
window.Menu = (() => {
    'use strict';

    const { html } = UI;
    const el = document.getElementById('menu');
    let state = { options: [], index: 0, title: '', header: null, open: false, onBack: null, search: null };

    const field = () => el.querySelector('.menu-search input');

    const render = () => {
        const q = state.search;
        const search = q ? { text: q.text, placeholder: q.placeholder, focused: state.index === -1, typing: q.typing, onInput: typed } : null;
        UI.render(html`<${Kit.SideMenu} title=${state.title} options=${state.options} index=${state.index} header=${state.header} search=${search} />`, el);
        // A long list (the languages) scrolls inside the dialog.
        const focused = el.querySelector('.focused');
        if (focused) focused.scrollIntoView({ block: 'nearest' });
    };

    const firstSelectable = () => state.options.findIndex((option) => !option.note);

    function typed(event) {
        const q = state.search;
        if (!q) return;
        q.text = event.currentTarget.value;
        state.options = q.build(q.text);
        render();
    }

    const stopTyping = () => {
        if (!state.search) return;
        state.search.typing = false;
        const input = field();
        if (input) input.blur();
    };

    const close = () => {
        stopTyping();
        state.open = false;
        el.classList.add('hidden');
    };

    const show = (next) => {
        state = next;
        el.classList.remove('profile-menu', 'key-help', 'multi-view-sheet');
        render();
        el.classList.remove('hidden');
        const current = state;
        // Async options must not reopen a menu dismissed with Return.
        return () => state === current && state.open;
    };

    // Keys while the keyboard is up: OK, Done or Down leave the field for the
    // list; Return leaves it on the field. Everything else types.
    function typingKey(code) {
        if (code === Keys.ENTER || code === Keys.IME_DONE || code === Keys.DOWN) {
            stopTyping();
            const first = firstSelectable();
            if (first !== -1) state.index = first;
        } else if (code === Keys.RETURN || code === Keys.ESCAPE || code === Keys.IME_CANCEL) {
            stopTyping();
        } else return false;
        render();
        return true;
    }

    function step(code) {
        const first = firstSelectable();
        if (state.search && state.index === -1) {
            if (code === Keys.DOWN && first !== -1) state.index = first;
            return;
        }
        // Up from the first option goes to the search field.
        if (state.search && code === Keys.UP && state.index <= first) {
            state.index = -1;
            return;
        }
        let at = state.index;
        do {
            const moved = Focus.step(at, state.options.length, code, 'column');
            if (moved.index === undefined) at = state.index;
            else at = moved.index;
        } while (at !== state.index && state.options[at].note);
        state.index = at;
    }

    return {
        close,
        open: (title, options, index, header, onBack) => show({ options, index: index || 0, title, header: header || null, open: true, onBack: onBack || null, search: null }),
        search: (title, placeholder, build, index) => {
            const options = build('');
            const start = options[index] && !options[index].note ? index : Math.max(0, options.findIndex((option) => !option.note));
            return show({ options, index: start, title, header: null, open: true, onBack: null, search: { text: '', placeholder, build, typing: false } });
        },
        isOpen: () => state.open,
        // A new title for the open menu (progress), keeping its options and focus.
        retitle: (title) => {
            if (!state.open) return;
            state.title = title;
            render();
        },
        onKey: (code) => {
            if (state.search && state.search.typing) return typingKey(code);
            if (code === Keys.UP || code === Keys.DOWN) {
                step(code);
                render();
            } else if (code === Keys.ENTER) {
                if (state.search && state.index === -1) {
                    state.search.typing = true;
                    render();
                    const input = field();
                    if (input) input.focus();
                    return true;
                }
                const option = state.options[state.index];
                if (option && option.note) return true;
                close();
                if (option.run) option.run();
            } else if (Keys.isBack(code)) {
                close();
                if (state.onBack) state.onBack();
            }
            // Everything else is swallowed while the menu is open.
            return true;
        },
    };
})();
