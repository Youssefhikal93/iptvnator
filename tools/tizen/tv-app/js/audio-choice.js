// The sound language the viewer picks in the player's Audio list (#55): kept
// per show and live channel (#83), alongside subtitle languages or Off.
// The latest sound pick also applies to new shows and movies. Per profile.
window.AudioChoice = (function () {
    'use strict';

    var KEEP = 100;
    var MAPS = ['shows', 'channels', 'textShows', 'textChannels'];

    function language(code) {
        return typeof code === 'string' && code.length > 0 && code.length <= 80;
    }

    // Old audio-only records and imported records use the same bounded shape.
    function clean(saved) {
        saved = saved && typeof saved === 'object' ? saved : {};
        var copy = { last: language(saved.last) ? saved.last : '' };
        MAPS.forEach(function (kind) {
            var entries = saved[kind];
            copy[kind] = Object.create(null);
            if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return;
            Object.keys(entries).filter(function (id) {
                return language(entries[id]) || kind.indexOf('text') === 0 && entries[id] === false;
            }).slice(-KEEP).forEach(function (id) { copy[kind][id] = entries[id]; });
        });
        return copy;
    }

    function key() {
        return ProfileStore.key('audio-choice');
    }

    function read() {
        try {
            return clean(JSON.parse(Stored.text(key())));
        } catch (e) {
            // Nothing saved yet.
        }
        return clean(null);
    }

    function showOf(request) {
        return (request && request.episodes && request.episodes.show) || '';
    }

    // Three-letter codes files use, for firmware without Intl.DisplayNames.
    var TWO = {
        ara: 'ar', eng: 'en', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', spa: 'es', ita: 'it', por: 'pt', rus: 'ru',
        tur: 'tr', dut: 'nl', nld: 'nl', pol: 'pl', gre: 'el', ell: 'el', chi: 'zh', zho: 'zh', jpn: 'ja', kor: 'ko',
        hin: 'hi', per: 'fa', fas: 'fa', heb: 'he', swe: 'sv', nor: 'no', dan: 'da', fin: 'fi', hun: 'hu', cze: 'cs',
        ces: 'cs', slo: 'sk', slk: 'sk', rum: 'ro', ron: 'ro', bul: 'bg', hrv: 'hr', srp: 'sr', ukr: 'uk', bel: 'be',
        alb: 'sq', sqi: 'sq', tha: 'th', vie: 'vi', ind: 'id', may: 'ms', msa: 'ms', urd: 'ur', ben: 'bn', tam: 'ta',
        tel: 'te', kur: 'ku', est: 'et', lav: 'lv', lit: 'lt', slv: 'sl', mac: 'mk', mkd: 'mk', bos: 'bs', cat: 'ca',
        baq: 'eu', eus: 'eu', glg: 'gl', ice: 'is', isl: 'is', tgl: 'tl', swa: 'sw', amh: 'am', som: 'so', pus: 'ps',
        aze: 'az', kaz: 'kk', uzb: 'uz', geo: 'ka', kat: 'ka', arm: 'hy', hye: 'hy', mon: 'mn',
    };

    // "eng", "en" and "en-GB" are one language.
    function name(code) {
        var primary = String(code || '').toLowerCase().split('-')[0];
        if (Object.prototype.hasOwnProperty.call(TWO, primary)) primary = TWO[primary];
        try {
            return new Intl.DisplayNames(['en'], { type: 'language' }).of(primary).toLowerCase();
        } catch (e) {
            return primary;
        }
    }

    function scope(request) {
        return request && request.live ? { audio: 'channels', text: 'textChannels', id: request.channel || '' } : { audio: 'shows', text: 'textShows', id: showOf(request) };
    }

    function save(saved) {
        try {
            Stored.save(key(), clean(saved));
        } catch (e) {
            // Without storage the next play uses its defaults.
        }
    }

    function update(entries, id, code) {
        if (!id) return;
        delete entries[id];
        entries[id] = code;
    }

    function remember(request, code) {
        if (!language(code)) return;
        var saved = read();
        var target = scope(request);
        update(saved[target.audio], target.id, code);
        saved.last = code;
        save(saved);
    }

    function rememberSubtitle(request, code) {
        var target = scope(request);
        if (!target.id || code !== false && !language(code)) return;
        var saved = read();
        update(saved[target.text], target.id, code);
        save(saved);
    }

    // Undefined means no choice; false is an explicit Off, not a default.
    function subtitle(request) {
        var target = scope(request);
        return read()[target.text][target.id];
    }

    // Import remaps source ids. With no timestamps, existing choices win Merge.
    function merge(saved, incoming, sources) {
        saved = clean(saved);
        incoming = clean(incoming);
        var merged = { last: saved.last || incoming.last };
        MAPS.forEach(function (kind) {
            var entries = Object.create(null);
            Object.keys(incoming[kind]).forEach(function (id) {
                var split = id.indexOf('|');
                var source = sources[id.slice(0, split)];
                if (split >= 0 && source) entries[source + id.slice(split)] = incoming[kind][id];
            });
            Object.keys(saved[kind]).forEach(function (id) {
                delete entries[id];
                entries[id] = saved[kind][id];
            });
            merged[kind] = entries;
        });
        return clean(merged);
    }

    // Of PlayerTracks' audio rows, the playable one in the remembered
    // language when another one plays now; else null.
    function pick(request, rows, preferred) {
        var saved = read();
        var target = scope(request);
        var want = saved[target.audio][target.id] || preferred || (!(request && request.live) && saved.last);
        if (!want) return null;
        var row = rows.filter(function (entry) {
            return entry.ref !== null && entry.language && name(entry.language) === name(want);
        })[0];
        return row && !row.active ? row : null;
    }

    return { remember: remember, pick: pick, name: name, rememberSubtitle: rememberSubtitle, subtitle: subtitle, clean: clean, merge: merge };
})();
