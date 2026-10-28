// Subsource, a backup subtitle provider (#52): asked only when OpenSubtitles
// and SubDL find nothing. A title is looked up first (per season for a
// show), then its subtitles; downloads arrive zipped. Results take the same
// shape as OpenSubs.search.
window.SubSource = (function () {
    'use strict';

    var BASE = 'https://api.subsource.net/api/v1';
    var PREFIX = 'subsource:';
    // Subsource names languages in English words.
    var NAMES = { en: 'english', ar: 'arabic', fr: 'french', de: 'german', es: 'spanish', it: 'italian', tr: 'turkish', sv: 'swedish',
        nl: 'dutch', pt: 'portuguese', ru: 'russian', fa: 'farsi_persian', zh: 'chinese', ja: 'japanese', ko: 'korean', pl: 'polish',
        da: 'danish', no: 'norwegian', fi: 'finnish', el: 'greek', he: 'hebrew', hi: 'hindi', id: 'indonesian', ur: 'urdu', be: 'belarusian' };

    function failure(status) {
        var error = new Error('Subsource request failed');
        error.provider = 'subsource';
        error.status = Number(status) || 0;
        error.code = status === 401 || status === 403 ? 'badKey' : status === 429 ? 'quota' : 'connection';
        error.reset = '';
        return error;
    }

    function request(path, kind) {
        var key = Prefs.get('subsourceApiKey');
        if (!key) return Promise.reject(failure(401));
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 12000);
        return fetch(BASE + path, { signal: controller.signal, credentials: 'omit',
            headers: { 'X-API-Key': key, Accept: kind === 'json' ? 'application/json' : '*/*' } }).then(function (response) {
            if (!response.ok) throw failure(response.status);
            return kind === 'json' ? response.json() : response.arrayBuffer();
        }).catch(function (error) {
            var safe = error && error.provider ? error : failure(0);
            Log.error('subsource failed ' + safe.status);
            throw safe;
        }).finally(function () { clearTimeout(timer); });
    }

    function language(code) {
        var base = String(code || 'en').split(',')[0].trim().toLowerCase().split('-')[0];
        return NAMES[base] || 'english';
    }

    function params(map) {
        return Object.keys(map).filter(function (key) { return map[key] !== undefined && map[key] !== ''; }).sort()
            .map(function (key) { return key + '=' + encodeURIComponent(String(map[key])); }).join('&');
    }

    // The title search: by IMDb id when known, otherwise by name.
    function titleQuery(info) {
        var episode = info.episode !== undefined;
        var imdb = /^(?:tt)?(\d+)$/i.exec(String(info.imdb_id || '').trim());
        var map = { type: episode ? 'series' : 'movie', season: episode ? Number(info.season) : undefined };
        if (imdb) {
            map.searchType = 'imdb';
            map.imdb = 'tt' + imdb[1];
        } else {
            map.searchType = 'text';
            map.q = String(info.title || '').trim();
            if (!episode && /^\d{4}$/.test(String(info.year))) map.year = info.year;
        }
        return params(map);
    }

    function pickTitle(list, info) {
        var tmdb = Number(info.tmdb_id) || 0;
        var season = info.episode !== undefined ? Number(info.season) : null;
        return list.filter(function (title) { return tmdb && Number(title.tmdbId) === tmdb && (season === null || Number(title.season) === season); })[0] ||
            list.filter(function (title) { return season === null || Number(title.season) === season; })[0];
    }

    function forEpisode(match, season, episode) {
        var tag = new RegExp('s0*' + season + '\\W?e0*' + episode + '(?!\\d)|\\b0*' + season + 'x0*' + episode + '(?!\\d)', 'i');
        return (match.releaseInfo || []).some(function (release) { return tag.test(release); });
    }

    function search(info, lang, limit) {
        var episode = info.episode !== undefined;
        if (episode && (!/^\d+$/.test(String(info.season)) || !/^\d+$/.test(String(info.episode)) || Number(info.episode) < 1)) {
            var invalid = failure(0);
            invalid.code = 'noResults';
            return Promise.reject(invalid);
        }
        return request('/movies/search?' + titleQuery(info), 'json').then(function (body) {
            var title = pickTitle(Array.isArray(body && body.data) ? body.data : [], info);
            if (!title || !/^\d+$/.test(String(title.movieId))) return { data: [] };
            return request('/subtitles?' + params({ movieId: title.movieId, language: language(lang), limit: 50 }), 'json');
        }).then(function (body) {
            var matches = [];
            (Array.isArray(body && body.data) ? body.data : []).forEach(function (entry) {
                if (!/^\d+$/.test(String(entry.subtitleId))) return;
                // A season's list holds every episode; keep the ones naming this one.
                if (episode && !forEpisode(entry, Number(info.season), Number(info.episode))) return;
                var releases = Array.isArray(entry.releaseInfo) ? entry.releaseInfo : [];
                matches.push({ source: 'subsource', file_id: PREFIX + entry.subtitleId, language: String(lang || 'en').split(',')[0],
                    release: String(releases[0] || ''), downloads: Number(entry.downloads) || 0, hearing: !!entry.hearingImpaired,
                    fps: Number(entry.framerate) || 0, hashMatch: false, trusted: false, machine: false,
                    season: info.season, episode: info.episode });
            });
            Log.info('subsource search ok n=' + matches.length);
            return matches.slice(0, limit || 10);
        });
    }

    function download(fileId, match) {
        var id = String(fileId || '').indexOf(PREFIX) === 0 ? String(fileId).slice(PREFIX.length) : '';
        if (!/^\d+$/.test(id)) return Promise.reject(failure(0));
        return request('/subtitles/' + id + '/download', 'binary').then(function (buffer) {
            return ZipFile.subtitle(buffer, match);
        }).then(function (text) {
            Log.info('subsource download ok');
            return { text: text, remaining: null };
        });
    }

    return { search: search, download: download, titleQuery: titleQuery, owns: function (fileId) { return String(fileId).indexOf(PREFIX) === 0; } };
})();
