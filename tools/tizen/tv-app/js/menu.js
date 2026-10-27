// A small options dialog over the browser, opened by holding OK on an item.
// Options are { label, run }; an option without run just closes the menu.
window.Menu = (() => {
    'use strict';

    const { html } = UI;
    const el = document.getElementById('menu');
    let state = { options: [], index: 0, title: '', open: false };

    const render = () => {
        UI.render(html`<${Kit.SideMenu} title=${state.title} options=${state.options} index=${state.index} />`, el);
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
        open: (title, options, index) => {
            state = { options, index: index || 0, title, open: true };
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
                const moved = Focus.step(state.index, state.options.length, code, 'column');
                if (moved.index !== undefined) state.index = moved.index;
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
