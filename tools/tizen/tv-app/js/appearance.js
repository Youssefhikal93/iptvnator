// Language and theme are app-wide Prefs that apply the moment they change.
window.Appearance = (function () {
    'use strict';

    function apply() {
        I18n.setLanguage(Prefs.get('language'));
        // The light palette is a [data-theme="light"] override of the :root tokens.
        document.documentElement.setAttribute('data-theme', Prefs.get('theme') === 'light' ? 'light' : 'dark');
    }

    Prefs.onChange(function (name) {
        if (name === 'language' || name === 'theme') apply();
    });
    apply();

    return { apply: apply };
})();
