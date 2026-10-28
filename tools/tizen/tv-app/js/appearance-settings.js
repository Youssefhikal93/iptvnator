// The Appearance rows of Settings.
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
            { get part() { return I18n.t('settings.appearance'); }, get label() { return I18n.t('settings.language'); }, run: pickLanguage, text: languageName },
            { get label() { return I18n.t('settings.theme'); }, key: 'theme', pills: true, choices: ['dark', 'light'], get labels() { return [I18n.t('settings.dark'), I18n.t('settings.light')]; } },
            { get label() { return I18n.t('settings.accent'); }, key: 'accent', pills: true, swatches: true, choices: ['blue', 'saffron', 'asphalt', 'violet', 'pink'], get labels() { return [I18n.t('settings.blue'), I18n.t('settings.saffron'), I18n.t('settings.asphalt'), I18n.t('settings.violet'), I18n.t('settings.pink')]; } },
            { get label() { return I18n.t('settings.density'); }, get hint() { return I18n.t('describe.density'); }, key: 'density', pills: true, choices: ['comfortable', 'compact'], get labels() { return [I18n.t('settings.comfortable'), I18n.t('settings.compact')]; } },
            // Off for older TVs where fades and growing tiles stutter.
            { get label() { return I18n.t('settings.motion'); }, get hint() { return I18n.t('describe.motion'); }, key: 'motion', pills: true, choices: ['on', 'off'], get labels() { return [I18n.t('settings.on'), I18n.t('settings.off')]; } },
            // Search and the view buttons; Off hides them until ▲ at the top of a list (#45).
            { get label() { return I18n.t('settings.topBar'); }, get hint() { return I18n.t('describe.topBar'); }, key: 'topBar', pills: true, choices: ['on', 'off'], get labels() { return [I18n.t('settings.on'), I18n.t('settings.off')]; } },
            // The main menu as a rail on the left or a bar along the top (#50).
            { get label() { return I18n.t('settings.menuPosition'); }, get hint() { return I18n.t('describe.menuPosition'); }, key: 'menuPosition', pills: true, choices: ['side', 'top'], get labels() { return [I18n.t('settings.side'), I18n.t('settings.top')]; } },
        ],
    };
})();
