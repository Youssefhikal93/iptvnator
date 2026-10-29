// Every viewer-visible string comes from one table per language (js/i18n/<code>.js).
// English is the source table and the fallback for any key a language lacks.
window.I18n = (function () {
    'use strict';

    // Each language's own name; a language is offered once its table is loaded.
    var LANGUAGES = [
        { code: 'en', name: 'English', locale: 'en' },
        { code: 'ar', name: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629', locale: 'ar' },
        { code: 'by', name: '\u0411\u0435\u043b\u0430\u0440\u0443\u0441\u043a\u0430\u044f', locale: 'be' },
        { code: 'de', name: 'Deutsch', locale: 'de' },
        { code: 'el', name: '\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac', locale: 'el' },
        { code: 'es', name: 'Espa\u00f1ol', locale: 'es' },
        { code: 'fr', name: 'Fran\u00e7ais', locale: 'fr' },
        { code: 'hu', name: 'Magyar', locale: 'hu' },
        { code: 'it', name: 'Italiano', locale: 'it' },
        { code: 'ja', name: '\u65e5\u672c\u8a9e', locale: 'ja' },
        { code: 'ko', name: '\ud55c\uad6d\uc5b4', locale: 'ko' },
        { code: 'nl', name: 'Nederlands', locale: 'nl' },
        { code: 'pl', name: 'Polski', locale: 'pl' },
        { code: 'pt', name: 'Portugu\u00eas', locale: 'pt' },
        { code: 'ru', name: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439', locale: 'ru' },
        { code: 'tr', name: 'T\u00fcrk\u00e7e', locale: 'tr' },
        { code: 'uk', name: '\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430', locale: 'uk' },
        { code: 'zh', name: '\u4e2d\u6587 (\u7b80\u4f53)', locale: 'zh-CN' },
        { code: 'zhtw', name: '\u4e2d\u6587 (\u7e41\u9ad4)', locale: 'zh-TW' },
    ];
    var tables = {};
    var current = 'en';
    var listeners = [];

    function find(code) {
        return LANGUAGES.filter(function (language) { return language.code === code; })[0];
    }

    function categoryOf(code, count) {
        try {
            return new Intl.PluralRules(find(code).locale).select(count);
        } catch (e) {
            return count === 1 ? 'one' : 'other';
        }
    }

    // Plural forms are separate keys: 'key.one', 'key.few', ... and 'key.other'.
    function pick(code, key, count) {
        var table = tables[code];
        if (!table) return undefined;
        if (typeof count === 'number') {
            var form = table[key + '.' + categoryOf(code, count)];
            if (form !== undefined) return form;
            if (table[key + '.other'] !== undefined) return table[key + '.other'];
        }
        return table[key];
    }

    function format(text, params) {
        if (!params) return text;
        return text.replace(/\{(\w+)\}/g, function (whole, name) {
            return params[name] === undefined ? whole : String(params[name]);
        });
    }

    function t(key, params) {
        var count = params ? params.count : undefined;
        var text = pick(current, key, count);
        if (text === undefined) text = pick('en', key, count);
        return format(text === undefined ? key : text, params);
    }

    // Static HTML names its string in data-i18n (text), data-i18n-title,
    // data-i18n-placeholder or data-i18n-label (aria-label).
    function apply(root) {
        if (typeof document === 'undefined') return;
        var scope = root || document;
        if (!scope.querySelectorAll) return;
        var pairs = [['data-i18n', null], ['data-i18n-title', 'title'], ['data-i18n-placeholder', 'placeholder'], ['data-i18n-label', 'aria-label']];
        pairs.forEach(function (pair) {
            Array.prototype.forEach.call(scope.querySelectorAll('[' + pair[0] + ']'), function (node) {
                var text = t(node.getAttribute(pair[0]));
                if (pair[1]) node.setAttribute(pair[1], text);
                else node.textContent = text;
            });
        });
    }

    function setLanguage(code) {
        if (!tables[code]) code = 'en';
        var changed = code !== current;
        current = code;
        if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = find(code).locale;
        apply();
        if (changed) listeners.slice().forEach(function (listener) { listener(code); });
        return code;
    }

    return {
        tables: tables,
        t: t,
        apply: apply,
        setLanguage: setLanguage,
        language: function () { return current; },
        // BCP 47 tag for toLocaleTimeString and friends.
        locale: function () { return find(current).locale; },
        // The catalogue saves "All channels" in English; it is told by its empty id.
        // All movies and All series say which section they hold.
        categoryName: function (category) {
            if (category.all) return t(category.all === 'movies' ? 'browser.allMovies' : 'browser.allSeries');
            return category.category_id === '' ? t('browser.allChannels') : category.category_name;
        },
        // 24-hour clock time in the chosen language, as the guide always showed it.
        time: function (when) {
            return new Date(when).toLocaleTimeString(find(current).locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
        },
        // A date such as "Mon, 4 Mar" in the chosen language.
        date: function (when, options) {
            return new Date(when).toLocaleDateString(find(current).locale, options);
        },
        // Languages with a loaded table, English first.
        languages: function () {
            return LANGUAGES.filter(function (language) { return tables[language.code]; });
        },
        onChange: function (listener) { listeners.push(listener); },
    };
})();
