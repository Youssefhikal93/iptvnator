// AVPlay rejects a provider's movie link that redirects to another server
// (PLAYER_ERROR_INVALID_URI, #29), so movies and episodes open the address
// the link redirects to. Logs hosts only, never the stream URL.
window.AvResolve = (function () {
    'use strict';

    var TIMEOUT_MS = 5000;

    function host(url) {
        try {
            return new URL(url).host;
        } catch (e) {
            return '?';
        }
    }

    // The address's file type only, e.g. " (.m3u8)": an HLS link that
    // redirects to one without it is not recognised as HLS.
    function kind(url) {
        try {
            var found = /\.([a-z0-9]{2,5})$/i.exec(new URL(url).pathname);
            return found ? ' (.' + found[1].toLowerCase() + ')' : ' (no extension)';
        } catch (e) {
            return '';
        }
    }

    // Resolves to { url } (the final address, or the original one when the
    // lookup fails or is slow) or { error: 'HTTP 503' } when the server refuses.
    function final(url) {
        var timer;
        var lookup = fetch(url, { headers: { Range: 'bytes=0-1' } }).then(function (res) {
            // Only two bytes were asked for; free the connection at once (ADR 0006).
            if (res.body && res.body.cancel) res.body.cancel().catch(function () {});
            // Some servers refuse the app's own request (it carries the app's
            // Origin) but not the TV's player: on 401 or 403 the player still
            // opens the link itself, and its own answer decides.
            if (res.status === 401 || res.status === 403) {
                Log.info('AVPlay redirect check refused (HTTP ' + res.status + ') ' + host(url) + ', opening the link itself');
                return { url: url };
            }
            if (res.status >= 400) return { error: 'HTTP ' + res.status };
            if (!res.redirected || !res.url || res.url === url) return { url: url };
            Log.info('AVPlay redirect ' + host(url) + ' -> ' + host(res.url) + kind(res.url));
            return { url: res.url };
        });
        var limit = new Promise(function (resolve) {
            timer = setTimeout(function () { resolve({ url: url }); }, TIMEOUT_MS);
        });
        return Promise.race([lookup, limit]).catch(function (e) {
            Log.error('AVPlay redirect lookup failed ' + host(url) + ' (' + e.name + ')');
            return { url: url };
        }).then(function (result) {
            clearTimeout(timer);
            return result;
        });
    }

    // One line per start: which embedded audio and subtitle tracks exist, with
    // their codecs, and the audio the provider reports (`expected`). An AUDIO
    // track missing from AVPlay while the provider lists one means the TV
    // cannot decode that sound. `when` marks a later look ("after 5s").
    // Returns whether an AUDIO track was listed (true when unknown).
    function tracks(av, expected, when) {
        try {
            var list = av.getTotalTrackInfo().map(function (track) {
                var info = {};
                try {
                    info = JSON.parse(track.extra_info || '{}');
                } catch (e) {
                    // Some firmware sends plain text.
                }
                var codec = info.fourCC || info.fourcc || info.codec || '';
                return track.type + ':' + (info.language || info.track_lang || '-') + (codec ? '/' + codec : '');
            });
            var said = expected && expected.codec_name ? ' (provider audio ' + expected.codec_name +
                (expected.profile ? ' ' + expected.profile : '') + (expected.channels ? ' ' + expected.channels + 'ch' : '') + ')' : '';
            Log.info('AVPlay tracks ' + (when ? when + ' ' : '') + (list.join(' ') || 'none') + said);
            return list.some(function (entry) { return entry.indexOf('AUDIO:') === 0; });
        } catch (e) {
            Log.error('AVPlay tracks unavailable (' + e.name + ')');
            return true;
        }
    }

    return { final: final, tracks: tracks, host: host };
})();
