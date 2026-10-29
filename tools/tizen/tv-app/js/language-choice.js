// Only loaded tracks participate; subtitle providers stay a manual player action.
window.LanguageChoice = (function () {
    'use strict';

    function read() {
        return { sound: Prefs.get('preferredSound'), subtitles: Prefs.get('preferredSubtitles') };
    }

    function same(a, b) {
        return !!a && !!b && AudioChoice.name(a) === AudioChoice.name(b);
    }

    // Only ever turns a track on: Off, no match or understood sound leave the
    // subtitles as they are, so a downloaded subtitle for the title stays.
    function subtitle(rows, sound, prefs) {
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
        if (request.live) return true;
        var playing = tracks.audio.filter(function (row) { return row.active; })[0];
        var sound = AudioChoice.pick(request, tracks.audio, prefs.sound);
        if (select(sound)) playing = sound;
        select(subtitle(tracks.text, playing && playing.language, prefs));
        return tracks.audio.some(function (row) { return !!row.select; });
    }

    return { read: read, apply: apply };
})();
