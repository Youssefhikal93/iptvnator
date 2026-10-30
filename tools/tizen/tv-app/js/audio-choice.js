// The sound language the viewer picks in the player's Audio list (#55): kept
// per show, so the next episode starts in it, and as the latest pick, which a
// movie or a new show starts in when the file has that language. Per profile.
window.AudioChoice = (function () {
    'use strict';

    var KEEP = 100;

    function key() {
        return ProfileStore.key('audio-choice');
    }

    function read() {
        try {
            var saved = JSON.parse(Stored.text(key()));
            if (saved && typeof saved === 'object' && saved.shows && typeof saved.shows === 'object') return saved;
        } catch (e) {
            // Nothing saved yet.
        }
        return { shows: {}, last: '' };
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

    function remember(request, language) {
        if (!language) return;
        var saved = read();
        var show = showOf(request);
        if (show) {
            delete saved.shows[show];
            saved.shows[show] = language;
            var shows = Object.keys(saved.shows);
            shows.slice(0, Math.max(0, shows.length - KEEP)).forEach(function (old) { delete saved.shows[old]; });
        }
        saved.last = language;
        try {
            Stored.save(key(), saved);
        } catch (e) {
            // Without storage the next episode starts in the file's own default.
        }
    }

    // Of PlayerTracks' audio rows, the playable one in the remembered
    // language when another one plays now; else null.
    function pick(request, rows, preferred) {
        var saved = read();
        var want = saved.shows[showOf(request)] || preferred || saved.last;
        if (!want) return null;
        var row = rows.filter(function (entry) {
            return entry.ref !== null && entry.language && name(entry.language) === name(want);
        })[0];
        return row && !row.active ? row : null;
    }

    return { remember: remember, pick: pick, name: name };
})();
