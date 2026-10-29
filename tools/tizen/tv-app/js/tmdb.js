window.Tmdb = (function () {
    'use strict';

    var queue = [];
    var running = 0;
    var pending = {};
    var matches = {};
    var expiries = new WeakMap();
    // After a 429 every background look-up waits until then (#58).
    var throttledUntil = 0;
    // Requests sent so far: the look-up paces itself by the ones it caused.
    var fetches = 0;

    function key() { return Prefs.get('tmdbApiKey') || ''; }
    function enabled() { return !!key(); }

    function pump() {
        while (running < 3 && queue.length) {
            running++;
            queue.shift()();
        }
    }

    // Scope refused-key responses without storing the secret in IndexedDB keys.
    function fingerprint(secret) {
        var hash = 2166136261;
        for (var i = 0; i < secret.length; i++) hash = Math.imul(hash ^ secret.charCodeAt(i), 16777619);
        return (hash >>> 0).toString(16);
    }

    function fetchResponse(job) {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 8000);
        var status = 0;
        fetches++;
        return fetch('https://api.themoviedb.org/3' + job.path + '?api_key=' + encodeURIComponent(job.secret) + (job.query ? '&' + job.query : ''), { signal: controller.signal })
            .then(function (res) {
                status = res.status;
                if (!res.ok) throw new Error('TMDB refused');
                return res.json();
            }).then(function (body) {
                return TmdbStore.put(job.cacheKey, body, false);
            }).catch(function () {
                Log.error('TMDB FAIL ' + job.path);
                // Too many requests: nothing is kept, so the next ask tries again.
                if (status === 429) {
                    throttledUntil = Date.now() + 30000;
                    return { body: null, failed: true, status: 429, expires: 0 };
                }
                return TmdbStore.put(job.cacheKey, null, true, status);
            }).then(function (record) {
                clearTimeout(timer);
                return record;
            });
    }

    function schedule(job) {
        return new Promise(function (resolve) {
            queue.push(function () {
                function finish(record) {
                    running--;
                    resolve(key() === job.secret ? record : null);
                    pump();
                }
                if (key() !== job.secret) return finish(null);
                fetchResponse(job).then(finish);
            });
            pump();
        });
    }

    // The saved or fetched record ({ body, failed, status }) or null.
    function load(path, params, force) {
        var secret = key();
        if (!secret) return Promise.resolve(null);
        params = TmdbLanguage.parameters(path, params);
        var query = TmdbLanguage.query(params);
        var cacheKey = fingerprint(secret) + '|' + path + '?' + query;
        var legacyKey = params.language === 'en-US' ? fingerprint(secret) + '|' + path + '?' + TmdbLanguage.legacyQuery(params) : null;
        if (pending[cacheKey]) return pending[cacheKey];
        var promise = (force ? Promise.resolve(null) : TmdbStore.get(cacheKey, legacyKey)).then(function (saved) {
            if (key() !== secret) return null;
            return saved || schedule({ path: path, query: query, secret: secret, cacheKey: cacheKey });
        });
        pending[cacheKey] = promise.then(function (record) {
            delete pending[cacheKey];
            if (record && record.body && typeof record.body === 'object') expiries.set(record.body, record.expires);
            return record || null;
        });
        return pending[cacheKey];
    }

    function request(path, params, force) {
        return load(path, params, force).then(function (record) { return record ? record.body : null; });
    }

    function clean(title) {
        return String(title || '').replace(/^\s*[A-Z]{2,3}\s*[:|\-]\s*/, '')
            .replace(/\b(?:2160p|1080p|720p|4k|uhd|fhd|hd)\b/gi, '').trim()
            .replace(/(?:\s+[\[(]?(?:19|20)\d{2}[\])]?$|[\[(](?:19|20)\d{2}[\])]$)/, '')
            .replace(/[()[\]{}]/g, '').replace(/\s+/g, ' ').trim();
    }

    function normalize(title) {
        return clean(title).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
            .replace(/[^a-z0-9\u0370-\u9fff]+/g, ' ').trim();
    }

    function year(item) {
        var explicit = /\b(?:19|20)\d{2}\b/.exec(String(item.year || item.release_date || item.first_air_date || ''));
        if (explicit) return explicit[0];
        var match = /(?:\s|[\[(])((?:19|20)\d{2})[\])]?(?:\s+(?:2160p|1080p|720p|4k|uhd|fhd|hd))*\s*$/i.exec(title(item));
        return match ? match[1] : '';
    }

    function id(item) { return Number(item.tmdb_id || item.tmdb || 0); }
    function title(item) { return item.title || item.name || ''; }

    function same(item, candidate) {
        if (id(item) && candidate.id) return id(item) === Number(candidate.id);
        var name = normalize(title(item));
        return (name === normalize(title(candidate)) || name === normalize(candidate.original_title || candidate.original_name)) && (!year(item) || !year(candidate) || year(item) === year(candidate));
    }

    function pick(item, results) {
        var candidates = (results || []).filter(function (candidate) { return same(item, candidate); });
        return candidates.length === 1 ? candidates[0] : null;
    }

    function identity(item, type, language) { return (language || TmdbLanguage.tag(I18n.language())) + '|' + type + '|' + id(item) + '|' + normalize(title(item)) + '|' + year(item); }

    function detail(path, language) {
        var params = { append_to_response: 'credits,videos,similar', language: language };
        return request(path, params).then(function (body) {
            if (!body) return null;
            // Keep the translated facts and trailers when only the plot is missing.
            var fallback = language !== 'en-US' && !body.overview ? request(path, Object.assign({}, params, { language: 'en-US' })) : Promise.resolve(null);
            return fallback.then(function (english) {
                var localized = TmdbLanguage.fill(body, english, language);
                expiries.set(localized, Math.min(expiries.get(body), english ? expiries.get(english) : Infinity));
                return localized;
            });
        });
    }

    function match(item, type, wanted) {
        if (!enabled() || (wanted && !wanted())) return Promise.resolve(null);
        var language = TmdbLanguage.tag(I18n.language());
        var params = { query: clean(title(item)) };
        if (year(item)) params[type === 'movie' ? 'year' : 'first_air_date_year'] = year(item);
        var resolving = id(item) ? Promise.resolve({ id: id(item) }) : request('/search/' + type, params).then(function (body) {
            return body && pick(item, body.results);
        });
        return resolving.then(function (found) {
            if (!found || (wanted && !wanted())) return null;
            return detail('/' + type + '/' + found.id, language);
        }).then(function (body) {
            if (body) matches[identity(item, type, language)] = { body: body, expires: expiries.get(body) };
            return body;
        });
    }

    // For the background collection look-up (#58), the same requests as
    // match() with what went wrong told apart: 'found' with the details,
    // 'none' when TMDB has no such title, 'failed' to try again later.
    // force: the details are asked again even when a saved answer is fresh (#67).
    function lookup(item, type, force) {
        if (!enabled()) return Promise.resolve({ status: 'failed' });
        var language = TmdbLanguage.tag(I18n.language());
        var params = { query: clean(title(item)) };
        if (year(item)) params[type === 'movie' ? 'year' : 'first_air_date_year'] = year(item);
        var resolving = id(item) ? Promise.resolve({ found: { id: id(item) } }) : load('/search/' + type, params).then(function (record) {
            return record && !record.failed ? { found: pick(item, (record.body || {}).results) } : null;
        });
        return resolving.then(function (result) {
            if (!result) return { status: 'failed' };
            if (!result.found) return { status: 'none' };
            var path = '/' + type + '/' + result.found.id;
            return load(path, { append_to_response: 'credits,videos,similar', language: language }, force).then(function (record) {
                if (!record || (record.failed && record.status !== 404)) return { status: 'failed' };
                if (record.failed) return { status: 'none' };
                return detail(path, language).then(function (body) {
                    if (!body) return { status: 'failed' };
                    matches[identity(item, type, language)] = { body: body, expires: expiries.get(body) };
                    return { status: 'found', body: body };
                });
            });
        });
    }

    // A collection's parts (#58): { status, body } like lookup().
    function collection(collectionId, force) {
        return load('/collection/' + collectionId, {}, force).then(function (record) {
            if (!record || (record.failed && record.status !== 404)) return { status: 'failed' };
            return record.failed ? { status: 'none' } : { status: 'found', body: record.body };
        });
    }

    function creditIndex(credits, type) {
        var index = { ids: Object.create(null), titles: Object.create(null) };
        credits.forEach(function (credit) {
            if (credit.media_type && credit.media_type !== type) return;
            index.ids[credit.id] = true;
            [title(credit), credit.original_title || credit.original_name].forEach(function (candidateTitle) {
                var name = normalize(candidateTitle);
                if (!name) return;
                if (!index.titles[name]) index.titles[name] = [];
                if (index.titles[name].indexOf(credit) === -1) index.titles[name].push(credit);
            });
        });
        return index;
    }

    function inLibrary(credits, catalogue) {
        var indexes = { movie: creditIndex(credits, 'movie'), tv: creditIndex(credits, 'tv') };
        return catalogue.filter(function (entry) {
            var index = indexes[entry.type];
            var known = matches[identity(entry.item, entry.type)];
            var tmdbId = id(entry.item) || (known && TmdbStore.fresh(known) ? known.body.id : 0);
            if (tmdbId) return !!index.ids[tmdbId];
            return !!pick(entry.item, index.titles[normalize(title(entry.item))]);
        });
    }

    function image(path, size) { return enabled() && path ? 'https://image.tmdb.org/t/p/' + size + path : ''; }

    return {
        enabled: enabled,
        request: request,
        match: match,
        lookup: lookup,
        collection: collection,
        throttled: function () { return Math.max(0, throttledUntil - Date.now()); },
        fetches: function () { return fetches; },
        clean: clean,
        normalize: normalize,
        year: year,
        pick: pick,
        inLibrary: inLibrary,
        image: image,
        cached: function (item, type) {
            var known = matches[identity(item, type)];
            return known && TmdbStore.fresh(known) ? known.body : null;
        },
    };
})();
