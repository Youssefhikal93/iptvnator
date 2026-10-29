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
        dialog.innerHTML = '<h1>' + I18n.t('tmdb.keyTitle') + '</h1><p>' + I18n.t('tmdb.keyIntro') + '</p>' +
            '<input type="text" aria-label="' + I18n.t('tmdb.keyTitle') + '" autocomplete="off" /><div><button>' + I18n.t('common.save') + '</button><button>' + I18n.t('common.cancel') + '</button></div>';
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

    // OK on a set key: Test, Change or Remove; on an empty one, the key entry.
    function choose(hooks, changed) {
        if (!Prefs.get('tmdbApiKey')) return edit(changed);
        Menu.open(I18n.t('tmdb.keyTitle'), [
            { label: I18n.t('tmdb.testKey'), run: function () { act('tmdb-test', hooks, changed); } },
            { label: I18n.t('keys.change'), run: function () { edit(changed); } },
            { label: I18n.t('tmdb.removeKey'), run: function () { act('tmdb-remove', hooks, changed); } },
            { label: I18n.t('common.cancel') },
        ]);
    }

    function act(action, hooks, changed) {
        if (action === 'tmdb-key') return choose(hooks, changed);
        if (action === 'tmdb-remove') {
            Prefs.set('tmdbApiKey', '');
            status = '';
            hooks.toast(I18n.t('tmdb.keyRemoved'));
            return changed();
        }
        if (!Tmdb.enabled()) return hooks.toast(I18n.t('tmdb.setFirst'));
        status = I18n.t('tmdb.checking');
        changed();
        var secret = Prefs.get('tmdbApiKey');
        Tmdb.request('/configuration', {}, true).then(function (body) {
            if (secret !== Prefs.get('tmdbApiKey')) return;
            status = I18n.t(body ? 'tmdb.keyWorks' : 'tmdb.keyRefused');
            hooks.toast(status);
            changed();
        });
    }

    return {
        rows: [
            // One row: the value shows the key's end and its last test; OK offers Test, Change, Remove.
            { group: 'TMDB', get label() { return I18n.t('tmdb.keyTitle'); }, action: 'tmdb-key',
                get hint() { return Prefs.get('tmdbApiKey') ? I18n.t('keys.hint') : ''; },
                text: function () {
                    var secret = Prefs.get('tmdbApiKey');
                    return secret ? I18n.t('tmdb.keySet', { last: secret.slice(-4) }) + (status ? ' · ' + status : '') : I18n.t('tmdb.notSet');
                } },
            { label: 'The Movie Database', text: I18n.t('tmdb.attribution') },
        ],
        act: act,
        isOpen: function () { return !!dialog; },
        onKey: function (event) {
            var code = event.keyCode;
            // The keyboard's own Cancel only closes the keyboard; the text stays.
            if (code === Keys.IME_CANCEL) return event.preventDefault();
            if (code === Keys.RETURN || code === Keys.ESCAPE) {
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
