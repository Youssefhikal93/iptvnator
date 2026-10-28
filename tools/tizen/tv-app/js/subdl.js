// SubDL, the second subtitle provider (#52): strong on Arabic and on
// streaming originals where OpenSubtitles has little. Results take the same
// shape as OpenSubs.search; downloads arrive zipped and are unpacked here.
window.SubDL = (function () {
    'use strict';

    var BASE = 'https://api.subdl.com/api/v1/subtitles';
    var FILES = 'https://dl.subdl.com/subtitle/';
    var PREFIX = 'subdl:'; // Keeps SubDL ids apart from OpenSubtitles file ids in the shared cache.

    function failure(status) {
        var error = new Error('SubDL request failed');
        error.provider = 'subdl';
        error.status = Number(status) || 0;
        error.code = status === 401 || status === 403 ? 'badKey' : status === 429 ? 'quota' : 'connection';
        error.reset = '';
        return error;
    }

    function fetchBody(url, kind) {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 12000);
        return fetch(url, { signal: controller.signal, credentials: 'omit', headers: { Accept: kind === 'json' ? 'application/json' : '*/*' } })
            .then(function (response) {
                if (!response.ok) throw failure(response.status);
                return kind === 'json' ? response.json() : response.arrayBuffer();
            }).catch(function (error) {
                var safe = error && error.provider ? error : failure(0);
                // Only the status: the URL carries the key.
                Log.error('subdl failed ' + safe.status);
                throw safe;
            }).finally(function () { clearTimeout(timer); });
    }

    function numeric(value) {
        var number = String(value || '').trim();
        return /^\d+$/.test(number) && Number(number) > 0 ? String(Number(number)) : '';
    }

    // "en" -> "EN"; SubDL has one code for both Chinese scripts.
    function language(code) {
        var base = String(code || 'en').split(',')[0].trim().toLowerCase();
        return /^zh/.test(base) ? 'ZH' : /^[a-z]{2}$/.test(base) ? base.toUpperCase() : 'EN';
    }

    // Providers name shows "AR - Love Is Blind, Habibi- الحب أعمى حبيبي"; SubDL
    // knows the Latin name alone.
    function name(title) {
        var text = String(title || '').trim().replace(/^[A-Z]{2,3}\s*[-|:]\s+/, '');
        var parts = text.split(/\s*[-|–]\s*/);
        var latin = parts.filter(function (part) { return /[a-z]/i.test(part); });
        return (latin.length && latin.length < parts.length ? latin.join(' - ') : text).trim();
    }

    function query(info, lang) {
        var params = { languages: language(lang), subs_per_page: 30 };
        var episode = info.episode !== undefined;
        var tmdb = numeric(info.tmdb_id);
        var imdb = numeric(String(info.imdb_id || '').replace(/^tt/i, ''));
        params.type = episode ? 'tv' : 'movie';
        if (episode) {
            if (!/^\d+$/.test(String(info.season)) || !/^\d+$/.test(String(info.episode)) || Number(info.episode) < 1) {
                var invalid = failure(0);
                invalid.code = 'noResults';
                throw invalid;
            }
            params.season_number = Number(info.season);
            params.episode_number = Number(info.episode);
        }
        if (tmdb) params.tmdb_id = tmdb;
        else if (imdb) params.imdb_id = 'tt' + imdb;
        else {
            params.film_name = name(info.title);
            if (!episode && /^\d{4}$/.test(String(info.year))) params.year = info.year;
        }
        return Object.keys(params).sort().map(function (key) { return key + '=' + encodeURIComponent(String(params[key])); }).join('&');
    }

    function search(info, lang, limit) {
        if (!Prefs.get('subdlApiKey')) return Promise.reject(failure(401));
        // A title SubDL doesn't know by its id may still be there by name:
        // TMDB's name first, then the provider's own title.
        var byId = numeric(info.tmdb_id) || numeric(String(info.imdb_id || '').replace(/^tt/i, ''));
        var names = [];
        [byId && info.title, info.providerTitle].forEach(function (title) {
            if (name(title) && names.indexOf(name(title)) < 0) names.push(name(title));
        });
        return names.reduce(function (found, title) {
            return found.then(function (matches) {
                if (matches.length) return matches;
                return ask({ title: title, year: info.year, season: info.season, episode: info.episode }, lang, limit);
            });
        }, ask(info, lang, limit));
    }

    function ask(info, lang, limit) {
        var key = Prefs.get('subdlApiKey');
        var wanted = query(info, lang);
        var episode = info.episode !== undefined ? Number(info.episode) : 0;
        return fetchBody(BASE + '?api_key=' + encodeURIComponent(key) + '&' + wanted, 'json').then(function (body) {
            if (!body) throw failure(0);
            if (body.status === false) {
                if (/key/i.test(String(body.error))) throw failure(403);
                // SubDL answered: it has no such title ("can't find movie or tv").
                Log.info('subdl search ok n=0 (title not found)');
                return [];
            }
            var matches = [];
            (Array.isArray(body.subtitles) ? body.subtitles : []).forEach(function (entry) {
                var id = /^\/subtitle\/([\w-]+)\.zip$/.exec(String(entry.url || ''));
                // A season pack needs a file picked from inside; the episode's own subtitle is enough.
                if (!id || entry.full_season || (episode && Number(entry.episode) && Number(entry.episode) !== episode)) return;
                matches.push({ source: 'subdl', file_id: PREFIX + id[1], language: language(entry.language || lang).toLowerCase(),
                    release: String(entry.release_name || entry.name || ''), downloads: 0, hearing: !!entry.hi,
                    fps: Number(entry.fps) || 0, hashMatch: false, trusted: false, machine: false,
                    season: info.season, episode: info.episode });
            });
            Log.info('subdl search ok n=' + matches.length);
            return matches.slice(0, limit || 10);
        });
    }

    function download(fileId, match) {
        var id = String(fileId || '').indexOf(PREFIX) === 0 ? String(fileId).slice(PREFIX.length) : '';
        if (!/^[\w-]+$/.test(id)) return Promise.reject(failure(0));
        return fetchBody(FILES + id + '.zip', 'binary').then(function (buffer) {
            return ZipFile.subtitle(buffer, match);
        }).then(function (text) {
            Log.info('subdl download ok');
            return { text: text, remaining: null };
        });
    }

    return { query: query, name: name, search: search, download: download, owns: function (fileId) { return String(fileId).indexOf(PREFIX) === 0; } };
})();
