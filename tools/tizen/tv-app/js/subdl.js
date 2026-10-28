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

    // An IMDb id's digits as written: tt0123456 keeps its zeros.
    function imdbDigits(value) {
        var digits = String(value || '').trim().replace(/^tt/i, '');
        return /^\d+$/.test(digits) && Number(digits) > 0 ? digits : '';
    }

    // "en" -> "EN"; SubDL has one code for both Chinese scripts.
    function language(code) {
        var base = String(code || 'en').split(',')[0].trim().toLowerCase();
        return /^zh/.test(base) ? 'ZH' : /^[a-z]{2}$/.test(base) ? base.toUpperCase() : 'EN';
    }

    // Providers name titles "AR - Love Is Blind, Habibi- الحب أعمى حبيبي" or
    // "صقر وكناريا - FHD". SubDL refuses quotes, slashes and brackets outright
    // ("unsafe characters"), and indexes "Grey's" as "grey s": they become
    // spaces. The Latin part wins when a title has one; otherwise the title
    // stays as it is, Arabic included.
    var QUALITY = /^(?:4k|uhd|fhd|hd|sd|hevc|x26[45]|h\.?26[45]|\d{3,4}p|multi|sub|dub|vip|new)$/i;
    function name(title) {
        var text = String(title || '').trim().replace(/^[A-Z]{2,3}\s*[-|:]\s+/, '')
            .replace(/[\[(](?:19|20)\d{2}[\])]/g, ' ')
            .replace(/[<>{}\[\]'"`´’;\\/()]/g, ' ');
        var parts = text.split(/\s+[-|–]\s*|\s*[-|–]\s+|\s*\|\s*/).map(function (part) {
            return part.split(/\s+/).filter(function (word) { return !QUALITY.test(word); }).join(' ').trim();
        }).filter(Boolean);
        var latin = parts.filter(function (part) { return /[a-z]/i.test(part); });
        return (latin.length ? latin : parts).join(' - ').replace(/\s+/g, ' ').trim();
    }

    // scope: 'episode' (the default), 'season' (every episode of the season)
    // or 'show' (no season: some shows are filed under season 0 or by arc).
    function query(info, lang, scope) {
        var params = { languages: language(lang), subs_per_page: 30, unpack: 1 };
        var episode = info.episode !== undefined;
        var tmdb = numeric(info.tmdb_id);
        var imdb = imdbDigits(info.imdb_id);
        params.type = episode ? 'tv' : 'movie';
        if (episode) {
            if (!/^\d+$/.test(String(info.season)) || !/^\d+$/.test(String(info.episode)) || Number(info.episode) < 1) {
                var invalid = failure(0);
                invalid.code = 'noResults';
                throw invalid;
            }
            if (scope !== 'show') params.season_number = Number(info.season);
            if (!scope || scope === 'episode') params.episode_number = Number(info.episode);
        }
        if (tmdb) params.tmdb_id = tmdb;
        else if (imdb) params.imdb_id = 'tt' + imdb;
        else {
            params.film_name = name(info.title);
            if (!episode && /^\d{4}$/.test(String(info.year))) params.year = info.year;
        }
        return Object.keys(params).sort().map(function (key) { return key + '=' + encodeURIComponent(String(params[key])); }).join('&');
    }

    // Who to ask, in order: the TMDB id, the IMDb id, TMDB's name, the
    // provider's own title. A show is asked for the episode, then the season,
    // then the whole show; a subject SubDL doesn't know is not asked again.
    function subjects(info) {
        var list = [];
        var tmdb = numeric(info.tmdb_id);
        var imdb = imdbDigits(info.imdb_id);
        if (tmdb) list.push({ tmdb_id: tmdb });
        if (imdb) list.push({ imdb_id: imdb });
        var names = [];
        [info.title, info.providerTitle].forEach(function (title) {
            var clean = name(title);
            if (clean && names.indexOf(clean) < 0) names.push(clean);
        });
        names.forEach(function (title) { list.push({ title: title, year: info.year }); });
        return list.map(function (subject) {
            return Object.assign(subject, { season: info.season, episode: info.episode });
        });
    }

    function search(info, lang, limit) {
        if (!Prefs.get('subdlApiKey')) return Promise.reject(failure(401));
        var scopes = info.episode !== undefined ? ['episode', 'season', 'show'] : ['movie'];
        var steps = [];
        subjects(info).forEach(function (subject) {
            scopes.forEach(function (scope) { steps.push({ subject: subject, scope: scope }); });
        });
        var unknown = [];
        return steps.reduce(function (found, step) {
            return found.then(function (matches) {
                if (matches.length || unknown.indexOf(step.subject) >= 0) return matches;
                return ask(step.subject, lang, limit, step.scope).then(function (answer) {
                    if (!answer.known) unknown.push(step.subject);
                    return answer.matches;
                });
            });
        }, Promise.resolve([]));
    }

    // Whether a row is for the wanted episode: its own episode, a range or a
    // whole-season pack holding it, or a release name tagged with it.
    function fits(entry, season, episode) {
        if (!episode) return true;
        var rowSeason = Number(entry.season);
        if (rowSeason && rowSeason !== season) return false;
        if (entry.full_season) return true;
        var from = Number(entry.episode_from);
        var end = Number(entry.episode_end);
        if (from && end && from !== end) return episode >= from && episode <= end;
        var own = Number(entry.episode);
        if (own) return own === episode;
        return ZipFile.tagged(entry.release_name || entry.name || '', season, episode);
    }

    // SubDL unpacks season packs itself (unpack=1): the episode's own file,
    // when its name doesn't say it is another episode.
    function unpacked(entry, season, episode) {
        var files = Array.isArray(entry.unpack_files) ? entry.unpack_files : [];
        var named = files.filter(function (file) { return ZipFile.tagged(file.name, season, episode); })
            .concat(files.filter(function (file) { return ZipFile.numbered(file.name, episode, season); }));
        var claimed = files.filter(function (file) {
            return Number(file.episode) === episode && !ZipFile.anyTag(file.name);
        });
        var full = function (file) { return !ZipFile.forced(file.name); };
        var file = named.filter(full)[0] || claimed.filter(full)[0] || named[0] || claimed[0];
        var link = file && /^\/subtitle\/([\w-]+)\/([\w-]+)(?:\?.*)?$/.exec(String(file.url || ''));
        return link ? { id: link[1] + '/' + link[2], name: String(file.name || '') } : null;
    }

    function ask(info, lang, limit, scope) {
        var key = Prefs.get('subdlApiKey');
        var wanted = query(info, lang, scope === 'movie' ? undefined : scope);
        var season = Number(info.season);
        var episode = info.episode !== undefined ? Number(info.episode) : 0;
        return fetchBody(BASE + '?api_key=' + encodeURIComponent(key) + '&' + wanted, 'json').then(function (body) {
            if (!body) throw failure(0);
            if (body.status === false) {
                if (/key/i.test(String(body.error))) throw failure(403);
                // SubDL answered: it has no such title ("can't find movie or tv").
                Log.info('subdl search ok n=0 (title not found)');
                return { known: false, matches: [] };
            }
            var matches = [];
            (Array.isArray(body.subtitles) ? body.subtitles : []).forEach(function (entry) {
                // SubDL appends "?api_key=…" to its links; only the id is kept.
                var id = /^\/subtitle\/([\w-]+)\.zip(?:\?.*)?$/.exec(String(entry.url || ''));
                if (!id || !fits(entry, season, episode)) return;
                var single = episode && Number(entry.episode) === episode && !entry.full_season;
                var pack = !!episode && !single;
                // A pack: SubDL's own copy of the episode's file, else the zip
                // with the file picked inside. Saved and cached by id, so a
                // pack's id names the episode it is for.
                var file = pack ? unpacked(entry, season, episode) : null;
                var fileId = PREFIX + (file ? file.id : id[1] + (pack ? '#s' + season + 'e' + episode : ''));
                var release = String(entry.release_name || entry.name || '');
                matches.push({ source: 'subdl', file_id: fileId, language: language(entry.language || lang).toLowerCase(),
                    release: release, downloads: 0, hearing: !!entry.hi,
                    forced: ZipFile.forced(release) || !!(file && ZipFile.forced(file.name)),
                    fps: Number(entry.fps) || 0, hashMatch: false, trusted: false, machine: false,
                    season: info.season, episode: info.episode, pack: pack && !file });
            });
            Log.info('subdl search ok n=' + matches.length + (scope && scope !== 'episode' && scope !== 'movie' ? ' (' + scope + ')' : ''));
            return { known: true, matches: matches.slice(0, limit || 10) };
        });
    }

    function download(fileId, match) {
        var parts = String(fileId || '').indexOf(PREFIX) === 0 ? String(fileId).slice(PREFIX.length).split('#') : [''];
        var id = parts[0];
        // An unpacked episode file: plain subtitle text, not a zip.
        if (/^[\w-]+\/[\w-]+$/.test(id)) {
            return fetchBody(FILES + id, 'binary').then(function (buffer) {
                Log.info('subdl download ok (episode file)');
                return { text: ZipFile.text(buffer), remaining: null };
            });
        }
        if (!/^[\w-]+$/.test(id)) return Promise.reject(failure(0));
        var episode = /^s(\d+)e(\d+)$/.exec(parts[1] || '');
        if (episode) match = Object.assign({}, match, { season: Number(episode[1]), episode: Number(episode[2]), pack: true });
        return fetchBody(FILES + id + '.zip', 'binary').then(function (buffer) {
            return ZipFile.subtitle(buffer, match);
        }).then(function (text) {
            Log.info('subdl download ok');
            return { text: text, remaining: null };
        });
    }

    return { query: query, name: name, search: search, download: download, owns: function (fileId) { return String(fileId).indexOf(PREFIX) === 0; } };
})();
