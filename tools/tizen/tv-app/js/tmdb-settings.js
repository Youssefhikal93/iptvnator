window.TmdbSettings = (function () {
    'use strict';

    var dialog = null;
    var status = '';

    function close() {
        if (!dialog) return;
        dialog.parentNode.removeChild(dialog);
        dialog = null;
    }

    function edit(changed) {
        dialog = document.createElement('div');
        dialog.id = 'tmdb-key-entry';
        dialog.className = 'tm-dialog';
        dialog.innerHTML = '<h1>TMDB API key</h1><p>Use your own free TMDB API key. Titles are sent to TMDB only while a key is set.</p>' +
            '<input type="text" aria-label="TMDB API key" autocomplete="off" /><div><button>Save</button><button>Cancel</button></div>';
        var input = dialog.querySelector('input');
        input.value = Prefs.get('tmdbApiKey') || '';
        var buttons = dialog.querySelectorAll('button');
        buttons[0].onclick = function () {
            Prefs.set('tmdbApiKey', input.value.trim());
            status = '';
            close();
            changed();
        };
        buttons[1].onclick = close;
        document.body.appendChild(dialog);
        input.focus();
    }

    function act(action, hooks, changed) {
        if (action === 'tmdb-key') return edit(changed);
        if (action === 'tmdb-remove') {
            Prefs.set('tmdbApiKey', '');
            status = '';
            hooks.toast('Key removed');
            return changed();
        }
        if (!Tmdb.enabled()) return hooks.toast('Set a TMDB API key first');
        status = 'Checking…';
        changed();
        var secret = Prefs.get('tmdbApiKey');
        Tmdb.request('/configuration', {}, true).then(function (body) {
            if (secret !== Prefs.get('tmdbApiKey')) return;
            status = body ? 'Key works' : 'Key refused';
            hooks.toast(status);
            changed();
        });
    }

    return {
        rows: [
            { group: 'TMDB', label: 'TMDB API key', action: 'tmdb-key', text: function () {
                var secret = Prefs.get('tmdbApiKey');
                return secret ? 'Set ••••' + secret.slice(-4) : 'Not set';
            } },
            { label: 'Test key', action: 'tmdb-test', text: function () { return status || 'OK to test'; } },
            { label: 'Remove key', action: 'tmdb-remove', text: '' },
            { label: 'The Movie Database', text: 'This product uses the TMDB API but is not endorsed or certified by TMDB.' },
        ],
        act: act,
        isOpen: function () { return !!dialog; },
        onKey: function (event) {
            var code = event.keyCode;
            if (code === Keys.RETURN || code === Keys.ESCAPE || code === Keys.IME_CANCEL) {
                close();
                return event.preventDefault();
            }
            var fields = Array.prototype.slice.call(dialog.querySelectorAll('input, button'));
            var at = fields.indexOf(document.activeElement);
            var step = code === Keys.DOWN || code === Keys.IME_DONE ? 1 : code === Keys.UP ? -1 : 0;
            if (at > 0 && (code === Keys.LEFT || code === Keys.RIGHT)) step = code === Keys.LEFT ? -1 : 1;
            if (step) {
                fields[Math.max(0, Math.min(fields.length - 1, at + step))].focus();
                event.preventDefault();
            }
        },
    };
})();
