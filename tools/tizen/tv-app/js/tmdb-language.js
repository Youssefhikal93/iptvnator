window.TmdbLanguage = (function () {
    'use strict';

    var TAGS = {
        en: 'en-US', ar: 'ar-SA', by: 'be-BY', de: 'de-DE',
        el: 'el-GR', es: 'es-ES', fr: 'fr-FR', hu: 'hu-HU', it: 'it-IT',
        ja: 'ja-JP', ko: 'ko-KR', nl: 'nl-NL', pl: 'pl-PL', pt: 'pt-PT',
        ru: 'ru-RU', tr: 'tr-TR', uk: 'uk-UA', zh: 'zh-CN', zhtw: 'zh-TW',
    };

    function tag(code) { return Object.prototype.hasOwnProperty.call(TAGS, code) ? TAGS[code] : 'en-US'; }

    function parameters(path, params) {
        var localized = Object.assign({ language: tag(I18n.language()) }, params);
        // Matching still compares the source's title with English search results.
        if (path.indexOf('/search/') === 0) localized.language = 'en-US';
        if (/(^|,)videos(,|$)/.test(localized.append_to_response || '') || /\/videos$/.test(path)) {
            localized.include_video_language = localized.language.split('-')[0] + ',en,null';
        }
        return localized;
    }

    function query(params) {
        return Object.keys(params || {}).sort().map(function (name) {
            return encodeURIComponent(name) + '=' + encodeURIComponent(params[name]);
        }).join('&');
    }

    function legacyQuery(params) {
        var legacy = Object.assign({}, params);
        delete legacy.language;
        delete legacy.include_video_language;
        return query(legacy);
    }

    function fill(body, english, language) {
        var localized = Object.assign({}, body);
        localized.overview = body.overview || (english && english.overview) || '';
        localized.title = body.title || body.original_title || (english && english.title) || '';
        localized.name = body.name || body.original_name || (english && english.name) || '';
        if (body.videos) {
            var preferred = language.split('-')[0];
            function rank(video) { return video.iso_639_1 === preferred ? 0 : video.iso_639_1 === 'en' ? 1 : 2; }
            localized.videos = Object.assign({}, body.videos, { results: (body.videos.results || []).slice().sort(function (a, b) { return rank(a) - rank(b); }) });
        }
        return localized;
    }

    function catalogueCard(entry, credits) {
        var card = TmdbView.catalogueCard(entry);
        var credit = Tmdb.pick(entry.item, credits);
        if (credit) card.name = credit.title || credit.name || credit.original_title || credit.original_name || card.name;
        return card;
    }

    return { tag: tag, parameters: parameters, query: query, legacyQuery: legacyQuery, fill: fill, catalogueCard: catalogueCard };
})();
