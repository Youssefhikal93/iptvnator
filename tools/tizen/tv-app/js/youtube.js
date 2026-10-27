// Packaged TV apps cannot supply the web origin YouTube's embedded player needs.
window.YouTube = (function () {
    'use strict';

    var APP_ID = '111299001912';
    var VIEW = 'http://tizen.org/appcontrol/operation/view';
    var WATCH = 'https://www.youtube.com/watch';
    var cached = null;
    var waiting = [];

    function videoId(text) {
        if (typeof text !== 'string') return '';
        text = text.trim();
        if (/^[\w-]{11}$/.test(text)) return text;
        try {
            var url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text.replace(/^\/\//, ''));
            var host = url.hostname.toLowerCase();
            var id = '';
            if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
            else if (host === 'youtube.com' || /\.youtube\.com$/.test(host)) {
                if (url.pathname === '/watch') id = url.searchParams.get('v');
                else id = (/^\/(?:embed|shorts|live|v)\/([^/]+)/.exec(url.pathname) || [])[1];
            }
            return /^[\w-]{11}$/.test(id || '') ? id : '';
        } catch (e) { return ''; }
    }

    function found(answer) {
        cached = answer;
        var callbacks = waiting;
        waiting = [];
        callbacks.forEach(function (callback) { callback(answer); });
    }

    function installed() {
        try {
            tizen.application.getAppInfo(APP_ID);
            found(true);
        } catch (e) { found(false); }
    }

    function available(callback) {
        if (cached !== null) return callback(cached);
        waiting.push(callback);
        if (waiting.length > 1) return;
        // The browser keeps the button so its failure toast can be checked.
        if (!window.tizen) return found(true);
        if (!tizen.application) return found(false);
        try {
            var control = new tizen.ApplicationControl(VIEW, WATCH);
            tizen.application.findAppControl(control, function (apps) {
                if (apps.length) found(true);
                else installed();
            }, installed);
        } catch (e) { installed(); }
    }

    function launch(id, onFail) {
        function failed() {
            Log.error('trailer launch failed: default');
            onFail();
        }
        try {
            var payload = new tizen.ApplicationControlData('PAYLOAD', [JSON.stringify({ values: 'v=' + id })]);
            var control = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default', null, null, null, [payload]);
            tizen.application.launchAppControl(control, APP_ID, function () {
                Log.info('trailer launch ok: default');
            }, failed);
        } catch (e) { failed(); }
    }

    function open(text, onFail) {
        function unavailable() {
            document.dispatchEvent(new Event('trailer-unavailable'));
            if (onFail) onFail();
        }
        var id = videoId(text);
        if (!id || !window.tizen || !tizen.application) return unavailable();
        // Release the source's connection before handing playback to another app.
        document.dispatchEvent(new Event('trailer-open'));
        function fallback() {
            Log.error('trailer launch failed: view');
            launch(id, unavailable);
        }
        try {
            var control = new tizen.ApplicationControl(VIEW, WATCH + '?v=' + id);
            tizen.application.launchAppControl(control, null, function () {
                Log.info('trailer launch ok: view');
            }, fallback);
        } catch (e) { fallback(); }
    }

    return { videoId: videoId, available: available, open: open };
})();
