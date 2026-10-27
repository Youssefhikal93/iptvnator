window.OpenSubs = (function () {
    'use strict';

    var BASE = 'https://api.opensubtitles.com/api/v1';
    var AGENT = 'IPTVnator TV v1.0';

    function failure(status, body) {
        var error = new Error('OpenSubtitles request failed');
        error.status = Number(status) || 0;
        error.code = status === 401 ? 'badKey' : status === 406 || status === 429 ? 'quota' : 'connection';
        // Only reset dates or durations reach the UI; messages can contain secrets or links.
        var reset = String((body || {}).reset_time || (body || {}).message || '');
        var date = /\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?/.exec(reset);
        var duration = /\b\d+\s+(?:hours?|minutes?|seconds?)(?:\s+(?:and\s+)?\d+\s+(?:hours?|minutes?|seconds?))*\b/i.exec(reset);
        error.reset = date ? date[0] : duration ? duration[0] : '';
        return error;
    }

    function fetchBody(url, options, kind) {
        var controller = new AbortController();
        options.signal = controller.signal;
        options.credentials = 'omit';
        var timer = setTimeout(function () { controller.abort(); }, 12000);
        return fetch(url, options).then(function (response) {
            if (!response.ok) {
                return response.json().catch(function () { return {}; }).then(function (body) {
                    throw failure(response.status, body);
                });
            }
            return kind === 'text' ? response.text() : response.json();
        }).catch(function (error) {
            var safe = error && error.code && error.status !== undefined ? error : failure(0);
            Log.error('opensubtitles failed ' + safe.status);
            throw safe;
        }).finally(function () { clearTimeout(timer); });
    }

    function request(path, body) {
        var key = Prefs.get('opensubtitlesApiKey');
        if (!key) return Promise.reject(failure(401));
        // Chromium may drop a scripted User-Agent; the API reads X-User-Agent then.
        var headers = { 'Api-Key': key, 'User-Agent': AGENT, 'X-User-Agent': AGENT, 'Accept': 'application/json' };
        var options = { headers: headers, method: body ? 'POST' : 'GET' };
        if (body) {
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
        return fetchBody(BASE + path, options, 'json');
    }

    function numeric(value) {
        var number = String(value || '').trim();
        return /^\d+$/.test(number) && Number(number) > 0 ? String(Number(number)) : '';
    }

    function languages(value) {
        return String(value || 'en').toLowerCase().split(',').map(function (code) { return code.trim(); })
            .filter(function (code, index, codes) { return /^[a-z]{2,3}(?:-[a-z]{2})?$/.test(code) && codes.indexOf(code) === index; }).sort().join(',') || 'en';
    }

    function query(info, language) {
        var params = { languages: languages(language) };
        // The hash comes from the first and last 64 KiB; only these 16 digits leave the TV.
        if (/^[0-9a-f]{16}$/i.test(String(info.moviehash || ''))) params.moviehash = String(info.moviehash);
        var episode = info.episode !== undefined;
        var tmdb = numeric(info.tmdb_id);
        var imdb = numeric(String(info.imdb_id || '').replace(/^tt/i, ''));
        if (episode) {
            if (!/^\d+$/.test(String(info.season)) || !/^\d+$/.test(String(info.episode)) || Number(info.episode) < 1) {
                var invalid = failure(0);
                invalid.code = 'noResults';
                throw invalid;
            }
            params.episode_number = Number(info.episode);
            params.season_number = Number(info.season);
        }
        if (tmdb) params[episode ? 'parent_tmdb_id' : 'tmdb_id'] = tmdb;
        else if (imdb) params[episode ? 'parent_imdb_id' : 'imdb_id'] = imdb;
        else {
            params.query = String(info.title || '').trim().toLowerCase();
            if (!episode && /^\d{4}$/.test(String(info.year))) params.year = info.year;
        }
        return Object.keys(params).sort().map(function (key) {
            // The API redirects %20 to +; ask for its own form straight away.
            return key + '=' + encodeURIComponent(String(params[key]).toLowerCase()).replace(/%20/g, '+');
        }).join('&');
    }

    function search(info, language, limit) {
        return request('/subtitles?' + query(info, language)).then(function (body) {
            var matches = [];
            (Array.isArray(body.data) ? body.data : []).forEach(function (entry) {
                var attributes = entry.attributes || {};
                (Array.isArray(attributes.files) ? attributes.files : []).forEach(function (file) {
                    if (!numeric(file.file_id)) return;
                    matches.push({ file_id: Number(file.file_id), language: String(attributes.language || ''),
                        release: String(attributes.release || file.file_name || ''), downloads: Number(attributes.download_count) || 0,
                        hearing: !!attributes.hearing_impaired, fps: Number(attributes.fps) || 0, hashMatch: attributes.moviehash_match === true,
                        trusted: !!attributes.from_trusted, machine: !!(attributes.ai_translated || attributes.machine_translated) });
                });
            });
            Log.info('opensubtitles search ok n=' + matches.length);
            return matches.slice(0, limit || 10);
        });
    }

    function download(fileId) {
        if (!numeric(fileId)) return Promise.reject(failure(0));
        return request('/download', { file_id: Number(fileId) }).then(function (body) {
            if (typeof body.link !== 'string' || !/^https:\/\//i.test(body.link)) throw failure(0);
            // The temporary host receives no API key and its URL never reaches the log or cache.
            return fetchBody(body.link, { method: 'GET' }, 'text').then(function (text) {
                if (text.length > 500000) throw failure(0);
                Log.info('opensubtitles download ok');
                return { text: text, remaining: body.remaining === undefined || body.remaining === null ? null : Number(body.remaining) };
            });
        });
    }

    return { query: query, search: search, download: download, languages: languages };
})();
