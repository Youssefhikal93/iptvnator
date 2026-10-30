// Only loaded tracks participate; subtitle providers stay a manual player action.
window.LanguageChoice = (function () {
    'use strict';

    function read() {
        return { sound: Prefs.get('preferredSound'), subtitles: Prefs.get('preferredSubtitles') };
    }

    function same(a, b) {
        return !!a && !!b && AudioChoice.name(a) === AudioChoice.name(b);
    }

    // Without a manual choice, defaults leave downloaded subtitles in place.
    function subtitle(request, rows, sound, prefs) {
        var chosen = AudioChoice.subtitle(request);
        if (chosen === false) return rows.filter(function (row) { return row.ref === -1 || row.ref === null; })[0] || null;
        if (chosen) return rows.filter(function (row) { return same(row.language, chosen); })[0] || null;
        var want = prefs.subtitles;
        if (!want.language) return null;
        if (want.when === 'only' && (same(sound, prefs.sound) || same(sound, want.language))) return null;
        return rows.filter(function (row) { return same(row.language, want.language); })[0] || null;
    }

    function select(row) {
        if (!row || row.active) return false;
        try {
            row.select();
            return true;
        } catch (e) {
            // A rejected track must not stop the file from playing.
            Log.error('TRACK preferred language failed ' + (e && e.name));
            return false;
        }
    }

    function apply(request, tracks, prefs) {
        var playing = tracks.audio.filter(function (row) { return row.active; })[0];
        var sound = AudioChoice.pick(request, tracks.audio, prefs.sound);
        var refused = !!sound && !sound.active && !select(sound);
        if (sound && !refused) playing = sound;
        var text = subtitle(request, tracks.text, playing && playing.language, prefs);
        if (text && !text.active && !select(text)) refused = true;
        // AVPlay gets one later look for a missing saved subtitle or a refused switch.
        var waiting = AudioChoice.subtitle(request) && !text;
        return !refused && !waiting && tracks.audio.some(function (row) { return !!row.select; });
    }

    return { read: read, apply: apply };
})();
