// Which address a movie or episode opens on (#54). Samsung TVs cannot decode
// DTS or TrueHD: AVPlay plays such a file without sound. Many Xtream servers
// also offer the same id as .m3u8 or .ts, often with the sound converted, so
// a file with only such sound (MediaSniff's list), or with no sound track
// five seconds in when its header could not be read, opens there first. AVPlay checks each for a sound track
// before it plays; when none has one, the file plays as it is and the viewer
// is told why it is silent. What worked is kept per file. Logs names only.
window.AudioRoute = (function () {
    'use strict';

    var STORE = 'iptvnator-tv:audio-route';
    var KEEP = 200;

    // The same id can be on two sources, so notes are kept per source too.
    function key(request) {
        return request.subtitleId || request.id;
    }

    function saved() {
        try {
            var list = JSON.parse(Stored.text(STORE));
            return list && typeof list === 'object' && !Array.isArray(list) ? list : {};
        } catch (e) { return {}; }
    }

    // `name` is 'm3u8' or 'ts' (that address had sound), 'none' (none did)
    // or 'original' (the viewer chose the file's own sound).
    function remember(request, name) {
        if (!request || !request.id) return;
        try {
            var list = saved();
            delete list[key(request)];
            list[key(request)] = name;
            var keys = Object.keys(list);
            keys.slice(0, Math.max(0, keys.length - KEEP)).forEach(function (old) { delete list[old]; });
            Stored.save(STORE, list);
        } catch (e) {
            // Without storage the next play checks again.
        }
    }

    // The file lists sound tracks and the TV can play none of them.
    function silentFile(audio) {
        return Array.isArray(audio) && audio.length > 0 && audio.every(function (track) { return PlayerTracks.unsupported(track.codec); });
    }

    // The addresses to try in order: { name, url, needsSound, silent, retry }.
    // needsSound: move on when it has no sound track; silent: the last
    // resort, so say the sound cannot play; retry: the file opens as usual,
    // and no sound five seconds in is worth a try of the other addresses.
    function plan(request, source, url) {
        var file = { name: 'file', url: url };
        var others = ((source && source.converted) || []).map(function (route) {
            // The .m3u8 link goes to AVPlay as it is, as other IPTV apps do:
            // its redirect may drop the .m3u8 that tells AVPlay it is HLS.
            return { name: route.name, url: route.url, needsSound: true, direct: route.name === 'm3u8' };
        });
        if (!others.length || !request || request.live || !request.id) return [file];
        var before = saved()[key(request)];
        // The viewer chose the file's own sound in the Audio list.
        if (request.audioRoute === 'original') return [file];
        // Converted sound asked for (or a retry): saved notes do not stand in the way.
        if (request.audioRetry) return others.concat([{ name: 'file', url: url, silent: true }]);
        if (before === 'original') return [file];
        // A header that names a playable track outranks an old "no sound" note.
        var playable = Array.isArray(request.fileAudio) && request.fileAudio.length > 0 && !silentFile(request.fileAudio);
        // 'none' (no address had sound); an older 'file' note predates the
        // direct .m3u8 try, so that file is checked again.
        if (before === 'none' && !playable) return [{ name: 'file', url: url, silent: true }];
        // What worked goes first; the other addresses stay, in case it stops working.
        var worked = others.filter(function (route) { return route.name === before; })[0];
        if (worked) return [worked].concat(others.filter(function (route) { return route !== worked; }), [{ name: 'file', url: url, silent: true }]);
        if (silentFile(request.fileAudio)) return others.concat([{ name: 'file', url: url, silent: true }]);
        // A file whose header named a playable track is not second-guessed.
        file.retry = !Array.isArray(request.fileAudio) || !request.fileAudio.length;
        return [file];
    }

    // The file turned out to have sound: drop the note so it is not silent next time.
    function forget(request) {
        if (!request || !request.id) return;
        try {
            var list = saved();
            if (!(key(request) in list)) return;
            delete list[key(request)];
            Stored.save(STORE, list);
        } catch (e) {
            // Without storage there is nothing to forget.
        }
    }

    // What the viewer is told when the file plays without sound.
    function message(request) {
        var codec = ((request && request.fileAudio) || []).filter(function (track) { return PlayerTracks.unsupported(track.codec); })[0];
        return codec ? I18n.t('player.soundUnsupported', { format: PlayerTracks.codecName(codec.codec) }) : I18n.t('player.soundUnsupportedFile');
    }

    // Whether the provider offers other addresses for what plays.
    function offered(request) {
        return !!request && !request.live && !!request.id && (request.sources || []).some(function (source) {
            return source.via === 'avplay' && source.converted && source.converted.length;
        });
    }

    return { plan: plan, remember: remember, forget: forget, message: message, offered: offered };
})();
