// The options sheet down the right (#48), opened by holding OK on an item.
// open(title, options, index, header, onBack) where header { image, sub }
// shows the item's artwork beside the title, and onBack runs when Return
// closes the menu.
// Options are { label, run, view }; view, when given, is drawn instead of
// the label (which still names the row for tests and logs). An option
// without run just closes the menu,
// and a { label, note: true } line is passed over by the focus.
window.Menu = (() => {
    'use strict';

    const { html } = UI;
    const el = document.getElementById('menu');
    let state = { options: [], index: 0, title: '', header: null, open: false, onBack: null };

    const render = () => {
        UI.render(html`<${Kit.SideMenu} title=${state.title} options=${state.options} index=${state.index} header=${state.header} />`, el);
        // A long list (the languages) scrolls inside the dialog.
        const focused = el.querySelector('.focused');
        if (focused) focused.scrollIntoView({ block: 'nearest' });
    };

    const close = () => {
        state.open = false;
        el.classList.add('hidden');
    };

    return {
        close,
        open: (title, options, index, header, onBack) => {
            state = { options, index: index || 0, title, header: header || null, open: true, onBack: onBack || null };
            el.classList.remove('profile-menu');
            render();
            el.classList.remove('hidden');
            const current = state;
            // Async options must not reopen a menu dismissed with Return.
            return () => state === current && state.open;
        },
        isOpen: () => state.open,
        // A new title for the open menu (progress), keeping its options and focus.
        retitle: (title) => {
            if (!state.open) return;
            state.title = title;
            render();
        },
        onKey: (code) => {
            if (code === Keys.UP || code === Keys.DOWN) {
                let at = state.index;
                do {
                    const moved = Focus.step(at, state.options.length, code, 'column');
                    if (moved.index === undefined) at = state.index;
                    else at = moved.index;
                } while (at !== state.index && state.options[at].note);
                state.index = at;
                render();
            } else if (code === Keys.ENTER) {
                const option = state.options[state.index];
                close();
                if (option && option.run) option.run();
            } else if (Keys.isBack(code)) {
                close();
                if (state.onBack) state.onBack();
            }
            // Everything else is swallowed while the menu is open.
            return true;
        },
    };
})();
