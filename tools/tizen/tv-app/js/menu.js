// A small options dialog over the browser, opened by holding OK on an item.
// Options are { label, run }; an option without run just closes the menu.
window.Menu = (function () {
    'use strict';

    var KEY = Keys;
    var el = document.getElementById('menu');
    var state = { options: [], index: 0, title: '', open: false };

    function render() {
        var scroll = el.scrollTop;
        el.innerHTML = '';
        var title = document.createElement('div');
        title.className = 'menu-title';
        title.textContent = state.title;
        el.appendChild(title);
        state.options.forEach(function (option, i) {
            var row = document.createElement('div');
            row.className = 'menu-row' + (i === state.index ? ' focused' : '');
            row.textContent = option.label;
            el.appendChild(row);
        });
        // A long list (the languages) scrolls inside the dialog.
        el.scrollTop = scroll;
        var focused = el.querySelector('.focused');
        if (focused) focused.scrollIntoView({ block: 'nearest' });
    }

    function close() {
        state.open = false;
        el.classList.add('hidden');
    }

    return {
        close: close,
        open: function (title, options, index) {
            state = { options: options, index: index || 0, title: title, open: true };
            el.classList.remove('profile-menu');
            render();
            el.classList.remove('hidden');
            var current = state;
            // Async options must not reopen a menu dismissed with Return.
            return function () {
                return state === current && state.open;
            };
        },
        isOpen: function () {
            return state.open;
        },
        onKey: function (code) {
            if (code === KEY.UP || code === KEY.DOWN) {
                var next = state.index + (code === KEY.UP ? -1 : 1);
                state.index = Math.max(0, Math.min(state.options.length - 1, next));
                render();
            } else if (code === KEY.ENTER) {
                var option = state.options[state.index];
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
