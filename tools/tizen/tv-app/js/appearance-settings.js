// The Language and Theme rows of Settings.
window.AppearanceSettings = (function () {
    'use strict';

    function languageName() {
        return I18n.languages().filter(function (language) { return language.code === I18n.language(); })[0].name;
    }

    // Twenty languages are too many to cycle through: OK opens them as a list.
    function pickLanguage() {
        var languages = I18n.languages();
        var at = 0;
        var options = languages.map(function (language, index) {
            if (language.code === I18n.language()) at = index;
            return {
                label: (language.code === I18n.language() ? '\u2713 ' : '') + language.name,
                run: function () { Prefs.set('language', language.code); },
            };
        });
        Menu.open(I18n.t('settings.language'), options, at);
    }

    return {
        rows: [
            { get group() { return I18n.t('settings.appearance'); }, get label() { return I18n.t('settings.language'); }, run: pickLanguage, text: languageName },
            { get label() { return I18n.t('settings.theme'); }, key: 'theme', choices: ['dark', 'light'], get labels() { return [I18n.t('settings.dark'), I18n.t('settings.light')]; } },
        ],
    };
})();
