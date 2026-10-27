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

    // Resolves to { url } (the final address, or the original one when the
    // lookup fails or is slow) or { error: 'HTTP 503' } when the server refuses.
    function final(url) {
        var timer;
        var lookup = fetch(url, { headers: { Range: 'bytes=0-1' } }).then(function (res) {
            // Only two bytes were asked for; free the connection at once (ADR 0006).
            if (res.body && res.body.cancel) res.body.cancel().catch(function () {});
            if (res.status >= 400) return { error: 'HTTP ' + res.status };
            if (!res.redirected || !res.url || res.url === url) return { url: url };
            Log.info('AVPlay redirect ' + host(url) + ' -> ' + host(res.url));
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

    // One line per start: which embedded audio and subtitle tracks exist.
    function tracks(av) {
        try {
            var list = av.getTotalTrackInfo().map(function (track) {
                var info = {};
                try {
                    info = JSON.parse(track.extra_info || '{}');
                } catch (e) {
                    // Some firmware sends plain text.
                }
                return track.type + ':' + (info.language || info.track_lang || '-');
            });
            Log.info('AVPlay tracks ' + (list.join(' ') || 'none'));
        } catch (e) {
            Log.error('AVPlay tracks unavailable (' + e.name + ')');
        }
    }

    return { final: final, tracks: tracks, host: host };
})();
