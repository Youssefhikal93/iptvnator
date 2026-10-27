// The options sheet down the right (#48), opened by holding OK on an item.
// open(title, options, index, header) where header { image, sub } shows the
// item's artwork beside the title.
// Options are { label, run }; an option without run just closes the menu,
// and a { label, note: true } line is passed over by the focus.
window.Menu = (() => {
    'use strict';

    const { html } = UI;
    const el = document.getElementById('menu');
    let state = { options: [], index: 0, title: '', header: null, open: false };

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
        open: (title, options, index, header) => {
            state = { options, index: index || 0, title, header: header || null, open: true };
            el.classList.remove('profile-menu');
            render();
            el.classList.remove('hidden');
            const current = state;
            // Async options must not reopen a menu dismissed with Return.
            return () => state === current && state.open;
        },
        isOpen: () => state.open,
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
            }
            // Everything else is swallowed while the menu is open.
            return true;
        },
    };
})();
