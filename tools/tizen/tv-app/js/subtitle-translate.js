// The last fallback for subtitles (#52): when no provider has the language
// wanted, a subtitle in another language is translated line by line with
// the viewer's own DeepL key. The result is cached like a download, under
// an id naming the source file and the target language.
window.SubtitleTranslate = (function () {
    'use strict';

    var PREFIX = 'deepl:';
    var BATCH = 50; // Lines per request; DeepL takes up to 50 texts at once.

    function failure(status) {
        var error = new Error('DeepL request failed');
        error.provider = 'deepl';
        error.status = Number(status) || 0;
        error.code = status === 401 || status === 403 ? 'badKey' : status === 456 || status === 429 ? 'quota' : 'connection';
        error.reset = '';
        return error;
    }

    function translate(texts, from, to) {
        var key = Prefs.get('deeplApiKey');
        if (!key) return Promise.reject(failure(401));
        // Free keys end in ":fx" and have their own host.
        var host = /:fx$/.test(key) ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 30000);
        return fetch(host + '/v2/translate', { method: 'POST', signal: controller.signal, credentials: 'omit',
            headers: { Authorization: 'DeepL-Auth-Key ' + key, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ text: texts, source_lang: from.toUpperCase(), target_lang: target(to) }) }).then(function (response) {
            if (!response.ok) throw failure(response.status);
            return response.json();
        }).then(function (body) {
            var lines = (body && Array.isArray(body.translations) ? body.translations : []).map(function (entry) { return String(entry.text || ''); });
            if (lines.length !== texts.length) throw failure(0);
            return lines;
        }).catch(function (error) {
            var safe = error && error.provider ? error : failure(0);
            Log.error('deepl failed ' + safe.status);
            throw safe;
        }).finally(function () { clearTimeout(timer); });
    }

    // DeepL wants a regional English and Portuguese.
    function target(code) {
        var base = String(code || 'en').toLowerCase();
        return base === 'en' ? 'EN-US' : base === 'pt' ? 'PT-PT' : /^zh/.test(base) ? 'ZH' : base.toUpperCase();
    }

    function clock(ms) {
        var pad = function (n, size) { return ('00' + n).slice(-size); };
        return pad(Math.floor(ms / 3600000), 2) + ':' + pad(Math.floor(ms / 60000) % 60, 2) + ':' + pad(Math.floor(ms / 1000) % 60, 2) + ',' + pad(ms % 1000, 3);
    }

    // Translates the cues in batches, telling progress(done, total) as it goes.
    function cues(text, from, to, progress) {
        var list = SubtitleFile.parse(text);
        if (!list.length) return Promise.reject(failure(0));
        var out = [];
        var step = function (at) {
            if (at >= list.length) return Promise.resolve();
            var batch = list.slice(at, at + BATCH);
            return translate(batch.map(function (cue) { return cue.text; }), from, to).then(function (lines) {
                out = out.concat(lines);
                if (progress) progress(Math.min(at + BATCH, list.length), list.length);
                return step(at + BATCH);
            });
        };
        return step(0).then(function () {
            return list.map(function (cue, i) { return (i + 1) + '\n' + clock(cue.start) + ' --> ' + clock(cue.end) + '\n' + out[i]; }).join('\n\n') + '\n';
        });
    }

    // match: { source (the subtitle to translate), from, to, progress }.
    function download(fileId, match) {
        if (!match || !match.source) return Promise.reject(failure(0));
        return SubtitleStore.obtain(match.source.file_id, match.source).then(function (result) {
            return cues(result.text, match.from, match.to, match.progress);
        }).then(function (text) {
            Log.info('deepl translate ok');
            return { text: text, remaining: null };
        });
    }

    return {
        id: function (sourceId, to) { return PREFIX + to + ':' + sourceId; },
        owns: function (fileId) { return String(fileId).indexOf(PREFIX) === 0; },
        download: download,
        translate: translate,
    };
})();
