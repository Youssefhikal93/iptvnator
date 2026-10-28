window.SubtitleStore = (function () {
    'use strict';

    var CACHE = 'iptvnator-tv:subtitle-cache';
    var LIMIT = 750000; // UTF-16 characters: at most about 1.5 MB of localStorage.
    var pending = {};

    function read(key) {
        try {
            var saved = JSON.parse(localStorage.getItem(key));
            if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
            Object.keys(saved).forEach(function (id) {
                if (!saved[id] || typeof saved[id] !== 'object' || Array.isArray(saved[id])) delete saved[id];
            });
            return saved;
        } catch (e) { return {}; }
    }

    function write(key, saved) {
        try {
            localStorage.setItem(key, JSON.stringify(saved));
            return true;
        } catch (e) {
            // A full store must not interrupt playback or erase the previous cache.
            return false;
        }
    }

    function cache(fileId, text) {
        var saved = read(CACHE);
        delete saved[fileId];
        saved[fileId] = { text: text, at: Date.now() };
        var oldest = Object.keys(saved).sort(function (a, b) { return saved[a].at - saved[b].at; });
        while (JSON.stringify(saved).length > LIMIT && oldest.length) delete saved[oldest.shift()];
        while (!write(CACHE, saved) && oldest.length) delete saved[oldest.shift()];
    }

    // The provider an id belongs to; OpenSubtitles ids are plain numbers.
    function provider(fileId) {
        return [SubDL, SubSource, SubtitleTranslate].filter(function (api) { return api.owns(fileId); })[0] || OpenSubs;
    }

    // match is the search result, which tells a provider which file of a zip
    // to take, or a translation what to translate.
    function obtain(fileId, match) {
        var hit = read(CACHE)[fileId];
        if (hit && typeof hit.text === 'string' && SubtitleFile.parse(hit.text).length) return Promise.resolve({ text: hit.text, remaining: null });
        if (!pending[fileId]) pending[fileId] = provider(fileId).download(fileId, match).then(function (result) {
            if (!SubtitleFile.parse(result.text).length) throw new Error('Invalid subtitle file');
            cache(fileId, result.text);
            return result;
        }).finally(function () { delete pending[fileId]; });
        return pending[fileId];
    }

    function titleKey() { return ProfileStore.key('downloaded-subtitles'); }

    function save(id, value) {
        var saved = read(titleKey());
        saved[id] = value;
        var keys = Object.keys(saved);
        // Remember the most recently changed 200 titles per profile.
        if (keys.length > 200) {
            keys.sort(function (a, b) { return saved[a].at - saved[b].at; });
            delete saved[keys[0]];
        }
        write(titleKey(), saved);
    }

    return {
        obtain: obtain,
        cached: function (fileId) {
            var hit = read(CACHE)[fileId];
            return hit && typeof hit.text === 'string' ? hit.text : '';
        },
        title: function (id) { return read(titleKey())[id] || {}; },
        save: function (id, fileId, offset, scale, name) { save(id, { file_id: fileId, offset: offset, scale: scale || 1, name: name || '', at: Date.now() }); },
    };
})();
