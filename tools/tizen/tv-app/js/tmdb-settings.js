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

    function act(action, hooks, changed) {
        if (action === 'tmdb-key') return edit(changed);
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
            { group: 'TMDB', get label() { return I18n.t('tmdb.keyTitle'); }, action: 'tmdb-key', text: function () {
                var secret = Prefs.get('tmdbApiKey');
                return secret ? I18n.t('tmdb.keySet', { last: secret.slice(-4) }) : I18n.t('tmdb.notSet');
            } },
            { get label() { return I18n.t('tmdb.testKey'); }, action: 'tmdb-test', text: function () { return status || I18n.t('tmdb.okToTest'); } },
            { get label() { return I18n.t('tmdb.removeKey'); }, action: 'tmdb-remove', text: '' },
            { label: 'The Movie Database', text: I18n.t('tmdb.attribution') },
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
