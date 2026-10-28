// Settings → Subtitles download: a key for each provider (OpenSubtitles and,
// since #52, SubDL) and the language searched.
window.OpenSubsSettings = (function () {
    'use strict';

    var PROVIDERS = {
        opensubs: { pref: 'opensubtitlesApiKey', key: 'opensubs.key', intro: 'opensubs.intro', errors: 'opensubs.',
            test: function () { return OpenSubs.search({ title: 'test' }, 'en'); } },
        subdl: { pref: 'subdlApiKey', key: 'subdl.key', intro: 'subdl.intro', errors: 'subdl.',
            test: function () { return SubDL.search({ title: 'test' }, 'en'); } },
    };
    var dialog = null;
    var status = { opensubs: '', subdl: '' };

    function close() {
        if (!dialog) return;
        dialog.parentNode.removeChild(dialog);
        dialog = null;
    }

    function edit(id, changed) {
        var provider = PROVIDERS[id];
        dialog = document.createElement('div');
        dialog.id = 'opensubs-key-entry';
        dialog.className = 'tm-dialog';
        dialog.innerHTML = '<h1>' + I18n.t(provider.key) + '</h1><p>' + I18n.t(provider.intro) + '</p>' +
            '<input type="password" aria-label="' + I18n.t(provider.key) + '" autocomplete="off" /><div><button>' + I18n.t('common.save') + '</button><button>' + I18n.t('common.cancel') + '</button></div>';
        var input = dialog.querySelector('input');
        input.value = Prefs.get(provider.pref) || '';
        var buttons = dialog.querySelectorAll('button');
        buttons[0].onclick = function () {
            Prefs.set(provider.pref, input.value.trim());
            status[id] = '';
            close();
            changed();
        };
        buttons[1].onclick = close;
        document.body.appendChild(dialog);
        input.focus();
    }

    // Actions read "opensubs-key", "opensubs-subdl-test" and so on.
    function act(action, hooks, changed) {
        var parts = action.split('-');
        var id = parts.length > 2 ? parts[1] : 'opensubs';
        var provider = PROVIDERS[id];
        var verb = parts[parts.length - 1];
        if (verb === 'key') return edit(id, changed);
        if (verb === 'remove') {
            Prefs.set(provider.pref, '');
            status[id] = '';
            hooks.toast(I18n.t('tmdb.keyRemoved'));
            return changed();
        }
        var secret = Prefs.get(provider.pref);
        if (!secret) return hooks.toast(I18n.t('opensubs.setFirst'));
        status[id] = I18n.t('tmdb.checking');
        changed();
        provider.test().then(function () {
            return I18n.t('tmdb.keyWorks');
        }, function (error) {
            return I18n.t(provider.errors + error.code, { reset: error.reset || '' });
        }).then(function (message) {
            if (secret !== Prefs.get(provider.pref)) return;
            status[id] = message;
            hooks.toast(message);
            changed();
        });
    }

    function languageChoices() {
        var ui = Prefs.get('language');
        var codes = { ary: 'ar', by: 'be', zh: 'zh-cn', zhtw: 'zh-tw' };
        var language = codes[ui] || ui;
        var choices = ['en', 'ar'].concat(language && language !== 'en' && language !== 'ar' ? [language] : []);
        var saved = Prefs.get('subtitleLanguages');
        // One language per search: a pair saved before keeps its first language.
        if (String(saved).indexOf(',') >= 0) {
            saved = String(saved).split(',')[0].trim();
            Prefs.set('subtitleLanguages', saved);
        }
        // A later UI language change must not mislabel an existing subtitle choice.
        if (choices.indexOf(saved) < 0 && OpenSubs.languages(saved) === saved) choices.push(saved);
        return choices;
    }

    function languageLabels() {
        return languageChoices().map(function (value) {
            return value.split(',').map(function (code) {
                var ui = { be: 'by', 'zh-cn': 'zh', 'zh-tw': 'zhtw' }[code] || code;
                var language = I18n.languages().filter(function (entry) { return entry.code === ui; })[0];
                return language ? language.name : code;
            }).join(' + ');
        });
    }

    return {
        rows: [
            { get group() { return I18n.t('opensubs.group'); }, get label() { return I18n.t('opensubs.key'); }, action: 'opensubs-key', text: function () {
                return Prefs.get('opensubtitlesApiKey') ? '••••' : I18n.t('tmdb.notSet');
            } },
            { get label() { return I18n.t('tmdb.testKey'); }, action: 'opensubs-test', text: function () { return status.opensubs || I18n.t('tmdb.okToTest'); } },
            { get label() { return I18n.t('tmdb.removeKey'); }, action: 'opensubs-remove', text: '' },
            { get label() { return I18n.t('subdl.key'); }, action: 'opensubs-subdl-key', text: function () {
                return Prefs.get('subdlApiKey') ? '••••' : I18n.t('tmdb.notSet');
            } },
            { get label() { return I18n.t('subdl.testKey'); }, action: 'opensubs-subdl-test', text: function () { return status.subdl || I18n.t('tmdb.okToTest'); } },
            { get label() { return I18n.t('subdl.removeKey'); }, action: 'opensubs-subdl-remove', text: '' },
            { get label() { return I18n.t('opensubs.languages'); }, key: 'subtitleLanguages', get choices() { return languageChoices(); }, get labels() { return languageLabels(); } },
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
