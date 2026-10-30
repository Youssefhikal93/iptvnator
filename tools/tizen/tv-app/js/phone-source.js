// Add a source from a phone (#85). The Tizen service IPTVnTVApp.PhoneSource
// serves the phone page on the home network; this talks to it over 127.0.0.1
// only. The details arrive once, go to the form, and are never logged.
window.PhoneSource = (function () {
    'use strict';

    var SERVICE = 'IPTVnTVApp.PhoneSource';
    var BASE = 'http://127.0.0.1:8777';
    var POLL_MS = 1500;
    var RETRY_MS = 600;
    var RETRIES = 12;
    var generation = 0;
    var timers = [];
    var active = false;

    function later(fn, ms) {
        var id = setTimeout(fn, ms);
        timers.push(id);
    }

    function clear() {
        timers.forEach(clearTimeout);
        timers = [];
    }

    // The page's words, in the TV's language.
    function words() {
        return {
            title: I18n.t('phone.pageTitle'),
            name: I18n.t('form.nameOptional'),
            url: I18n.t('form.serverUrl'),
            user: I18n.t('form.username'),
            pass: I18n.t('form.password'),
            send: I18n.t('phone.send'),
            sent: I18n.t('phone.sent'),
            failed: I18n.t('phone.pageFailed'),
            expired: I18n.t('phone.expired'),
        };
    }

    // Wakes the service; without Tizen (the browser tests) it is already up.
    function launch() {
        try {
            if (typeof tizen !== 'undefined' && tizen.application && tizen.ApplicationControl) {
                tizen.application.launchAppControl(new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default'), SERVICE, function () {}, function () {});
            }
        } catch (ignored) { /* the open request below reports it */ }
    }

    function call(path, body) {
        var options = body ? { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) } : {};
        return fetch(BASE + path, options).then(function (response) {
            return response.json();
        });
    }

    function close() {
        generation++;
        clear();
        if (!active) return;
        active = false;
        call('/close', {}).catch(function () {});
    }

    // handlers: code({ code, url }), received(source), expired(), failed().
    function open(kind, handlers) {
        close();
        var mine = generation;
        var tries = 0;
        active = true;
        launch();

        function poll() {
            call('/poll').then(function (answer) {
                if (mine !== generation) return;
                if (answer.state === 'received') {
                    close();
                    return handlers.received(answer.payload);
                }
                if (answer.state === 'waiting') return later(poll, POLL_MS);
                close();
                handlers.expired();
            }).catch(function () {
                if (mine !== generation) return;
                close();
                handlers.failed();
            });
        }

        function request() {
            tries++;
            call('/open', { kind: kind, words: words(), dir: I18n.language() === 'ar' ? 'rtl' : 'ltr' }).then(function (info) {
                if (mine !== generation) return;
                if (info.error) throw new Error(info.error);
                handlers.code({ code: info.code, url: 'http://' + info.ip + ':' + info.port + '/' + info.code });
                // The TV's own clock ends the screen even if the service is gone.
                later(function () {
                    close();
                    handlers.expired();
                }, info.ttl);
                later(poll, POLL_MS);
            }).catch(function () {
                if (mine !== generation) return;
                if (tries >= RETRIES) {
                    close();
                    return handlers.failed();
                }
                // The service takes a moment to start.
                later(request, RETRY_MS);
            });
        }
        request();
    }

    return { open: open, close: close };
})();
