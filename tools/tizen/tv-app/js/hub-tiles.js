// Jo-TV tiles on the Samsung home screen (#91, Smart Hub Preview). The app
// builds the tiles (Continue watching, Recent channels) and hands them to the
// service IPTVnTVApp.HubPreview, which gives them to the TV and exits. A tile
// carries only the source id, section and item key; picking it opens the app
// with that, and the browser plays the item. Samsung takes one update per 10
// minutes and drops the rest, so an update waits until 10 minutes have passed.
//
// build(sourceId, lists) -> preview JSON text; lists: { continue: [tile],
//   live: [tile] }, tile = { section, key, title, subtitle, image }
// publish(text) -> 'sent' | 'same' | 'later' | 'off' (no Tizen)
// action(appControl) -> { s, sec, key } from a picked tile, or null
// listen(open): open(action) for the tile that opened or woke the app
window.HubTiles = (function () {
    'use strict';

    var SERVICE = 'IPTVnTVApp.HubPreview';
    var STORE = 'iptvnator-tv:hub-tiles';
    var WAIT_MS = 10 * 60 * 1000;
    var MAX = 6;
    // Tests replace the TV's application calls.
    var platform = window.__hubTilesPlatform || null;

    function tizenPlatform() {
        if (typeof tizen === 'undefined' || !tizen.application || !tizen.ApplicationControl) return null;
        return {
            launch: function (text, done, failed) {
                var control = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/pick', null, null, null,
                    [new tizen.ApplicationControlData('caller', ['ForegroundApp']), new tizen.ApplicationControlData('preview', [text])]);
                tizen.application.launchAppControl(control, SERVICE, done, failed);
            },
            requested: function () {
                var request = tizen.application.getCurrentApplication().getRequestedAppControl();
                return request && request.appControl;
            },
        };
    }

    function system() {
        return platform || (platform = tizenPlatform());
    }

    // Square logos for channels, posters for movies and shows.
    function tile(entry, live, sourceId) {
        var out = {
            title: entry.title,
            image_ratio: live ? '1by1' : '2by3',
            image_url: entry.image,
            action_data: JSON.stringify({ s: sourceId, sec: entry.section, key: entry.key }),
            is_playable: true,
        };
        if (entry.subtitle) out.subtitle = entry.subtitle;
        return out;
    }

    // Samsung needs a picture for every tile; one without is left out.
    function usable(entry) {
        return !!entry && !!entry.title && /^https?:\/\//i.test(entry.image || '');
    }

    function section(title, entries, live, sourceId) {
        var tiles = (entries || []).filter(usable).slice(0, MAX).map(function (entry) { return tile(entry, live, sourceId); });
        return tiles.length ? { title: title, tiles: tiles } : null;
    }

    function build(sourceId, lists) {
        var sections = [
            section(I18n.t('browser.continueWatching'), lists && lists.continue, false, sourceId),
            section(I18n.t('home.recentLive'), lists && lists.live, true, sourceId),
        ].filter(Boolean);
        return JSON.stringify({ sections: sections });
    }

    function saved() {
        try {
            return Stored.json(STORE) || {};
        } catch (e) { return {}; }
    }

    function publish(text, now) {
        var tv = system();
        if (!tv) return 'off';
        var last = saved();
        if (last.text === text) return 'same';
        var at = now || Date.now();
        if (last.at && at - last.at < WAIT_MS) return 'later';
        try {
            Stored.save(STORE, { at: at, text: text });
            tv.launch(text, function () {
                Log.info('HUBTILES sent ' + (JSON.parse(text).sections || []).reduce(function (n, part) { return n + part.tiles.length; }, 0) + ' tiles');
            }, function (e) {
                Log.error('HUBTILES launch failed ' + (e && e.message));
            });
        } catch (e) {
            Log.error('HUBTILES not sent ' + e.message);
        }
        return 'sent';
    }

    // The tile's action_data arrives as PAYLOAD: {"values": "<action_data>"}.
    function action(appControl) {
        var data = (appControl && appControl.data) || [];
        for (var i = 0; i < data.length; i++) {
            if (data[i].key !== 'PAYLOAD') continue;
            try {
                var picked = JSON.parse(JSON.parse(data[i].value[0]).values);
                if (picked && picked.s && picked.sec && picked.key !== undefined) return picked;
            } catch (e) {
                Log.error('HUBTILES tile not read');
            }
        }
        return null;
    }

    function listen(open) {
        var tv = system();
        if (!tv) return;
        var check = function () {
            try {
                var picked = action(tv.requested());
                if (picked) open(picked);
            } catch (e) {
                Log.error('HUBTILES request not read ' + e.message);
            }
        };
        window.addEventListener('appcontrol', check);
        check();
    }

    return { build: build, publish: publish, action: action, listen: listen, WAIT_MS: WAIT_MS };
})();
