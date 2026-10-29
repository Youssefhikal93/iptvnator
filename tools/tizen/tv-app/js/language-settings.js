window.LanguageSettings = (function () {
    'use strict';

    function code(ui) {
        return { ary: 'ar', by: 'be', zh: 'zh-cn', zhtw: 'zh-tw' }[ui] || ui;
    }

    function choices(all) {
        var first = all ? ['ar', 'en'] : ['en', 'ar'];
        return first.concat(code(Prefs.get('language'))).concat(all ? I18n.languages().map(function (entry) {
            return code(entry.code);
        }) : []).filter(function (value, index, list) { return value && list.indexOf(value) === index; });
    }

    function labels(values) {
        return values.map(function (value) {
            var language = I18n.languages().filter(function (entry) { return code(entry.code) === value; })[0];
            return language ? language.name : value;
        });
    }

    function subtitles(field, value) {
        var saved = Prefs.get('preferredSubtitles');
        if (arguments.length === 1) return saved[field];
        var next = { language: saved.language, when: saved.when };
        next[field] = value;
        Prefs.set('preferredSubtitles', next);
    }

    return {
        choices: choices,
        labels: labels,
        rows: [
            { get label() { return I18n.t('settings.preferredSound'); }, key: 'preferredSound',
                get choices() { return [''].concat(choices(true)); },
                get labels() { return [I18n.t('tmdb.notSet')].concat(labels(choices(true))); } },
            { get label() { return I18n.t('settings.preferredSubtitles'); }, key: 'preferredSubtitles',
                read: function () { return subtitles('language'); }, write: function (value) { subtitles('language', value); },
                get choices() { return [''].concat(choices(true)); },
                get labels() { return [I18n.t('common.off')].concat(labels(choices(true))); } },
            { get label() { return I18n.t('settings.showSubtitles'); }, key: 'preferredSubtitles',
                get hidden() { return !subtitles('language'); },
                read: function () { return subtitles('when'); }, write: function (value) { subtitles('when', value); },
                choices: ['always', 'only'],
                get labels() { return [I18n.t('settings.subtitlesAlways'), I18n.t('settings.subtitlesOnly')]; } },
        ],
    };
})();
