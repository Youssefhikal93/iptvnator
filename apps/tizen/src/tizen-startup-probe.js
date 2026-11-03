/* eslint-disable no-var, @typescript-eslint/no-unused-vars -- ES5 on purpose (var, catch bindings), see below. */
/*
 * IPTVnator Tizen startup probe (phase 0, issue #18).
 *
 * Injected only into the Tizen widget's index.html, before every other
 * script. Plain ES5 on purpose: it must run and report even when the
 * engine cannot parse the Angular bundles.
 *
 * Milestones are milliseconds from navigation start (performance.now()):
 *   probe        this script executed
 *   fcp          first contentful paint (the index.html splash)
 *   domReady     DOMContentLoaded
 *   load         window load
 *   firstRender  Angular bootstrapped and removed #initial-splash
 *   appReady     the first screen (a component in the nested workspace
 *                router outlet, named in `screen`) is in the DOM and nothing
 *                under <app-root> changed for QUIET_MS; the time reported is
 *                the last change. Capped at CAP_MS.
 *
 * It never records URLs, query strings, playlist data or credentials:
 * resource names and free-form error messages are omitted because they can
 * contain provider credentials or playlist URLs.
 *
 * Results: console line "[tizen-startup] {json}", window.__TIZEN_STARTUP__,
 * the last five runs in localStorage "iptvnator-tizen-startup", and a small
 * on-screen badge for 20 s (disable: localStorage
 * "iptvnator-tizen-startup-badge" = "off").
 */
(function () {
    'use strict';
    var QUIET_MS = 1000;
    var CAP_MS = 30000;
    var BADGE_MS = 20000;
    var STORE_KEY = 'iptvnator-tizen-startup';
    var BADGE_KEY = 'iptvnator-tizen-startup-badge';
    var perf = window.performance;
    var now = function () {
        return Math.round(perf && perf.now ? perf.now() : 0);
    };
    var result = {
        v: 1,
        engine: engineVersion(),
        tizen: tizenVersion(),
        probe: now(),
        fcp: null,
        domReady: null,
        load: null,
        firstRender: null,
        appReady: null,
        appReadyCapped: false,
        screen: null,
        heapMb: null,
        errors: [],
    };
    window.__TIZEN_STARTUP__ = result;

    function engineVersion() {
        var match = /Chrome\/(\d+)/.exec(navigator.userAgent || '');
        return match ? 'Chromium ' + match[1] : 'unknown';
    }

    function tizenVersion() {
        var match = /Tizen (\d+(?:\.\d+)?)/.exec(navigator.userAgent || '');
        return match ? match[1] : null;
    }

    function addError(text) {
        if (result.errors.length < 5) result.errors.push(text);
    }

    window.addEventListener(
        'error',
        function (event) {
            var target = event.target;
            if (target && target !== window && target.tagName) {
                addError('resource load failed (details omitted)');
            } else {
                addError('script error (details omitted)');
            }
        },
        true
    );
    window.addEventListener('unhandledrejection', function () {
        addError('unhandled rejection (details omitted)');
    });

    if (window.PerformanceObserver) {
        try {
            new PerformanceObserver(function (list) {
                list.getEntries().forEach(function (entry) {
                    if (
                        entry.name === 'first-contentful-paint' &&
                        result.fcp === null
                    ) {
                        result.fcp = Math.round(entry.startTime);
                    }
                });
            }).observe({ type: 'paint', buffered: true });
        } catch (ignored) {
            // Older engines without buffered paint entries: fcp stays null.
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        result.domReady = now();
        watchSplash();
    });
    window.addEventListener('load', function () {
        result.load = now();
    });

    function watchSplash() {
        var observer = new MutationObserver(function () {
            if (!document.getElementById('initial-splash')) {
                observer.disconnect();
                result.firstRender = now();
                watchQuiet();
            }
        });
        observer.observe(document.body, { childList: true });
        setTimeout(function () {
            if (result.firstRender === null) {
                observer.disconnect();
                addError('splash never removed within ' + CAP_MS + ' ms');
                finish(true);
            }
        }, CAP_MS);
    }

    // The first screen is a component in a nested router outlet (the
    // workspace shell's route: dashboard, playlist, settings...). Without
    // waiting for it, a slow lazy-chunk load looks like a settled page.
    function firstScreen() {
        var screen = document.querySelector(
            'router-outlet ~ * router-outlet ~ *'
        );
        return screen ? screen.tagName.toLowerCase() : null;
    }

    function watchQuiet() {
        var root = document.querySelector('app-root') || document.body;
        var lastChange = now();
        var observer = new MutationObserver(function () {
            lastChange = now();
        });
        observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
        });
        var timer = setInterval(function () {
            var capped = now() > CAP_MS;
            result.screen = firstScreen();
            if ((result.screen && now() - lastChange >= QUIET_MS) || capped) {
                clearInterval(timer);
                observer.disconnect();
                result.appReady = lastChange;
                finish(capped);
            }
        }, 100);
    }

    function finish(capped) {
        result.appReadyCapped = capped;
        if (perf && perf.memory) {
            result.heapMb = Math.round(perf.memory.usedJSHeapSize / 1048576);
        }
        result.done = true;
        if (window.console && console.log) {
            console.log('[tizen-startup] ' + JSON.stringify(result));
        }
        remember();
        showBadge();
    }

    function remember() {
        try {
            var runs = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
            runs.unshift({ at: new Date().toISOString(), result: result });
            localStorage.setItem(STORE_KEY, JSON.stringify(runs.slice(0, 5)));
        } catch (ignored) {
            // Storage may be unavailable; the console line still has the data.
        }
    }

    // Shared with tizen-scroll-probe.js; a new badge replaces the previous one.
    var currentBadge = null;
    window.__TIZEN_PROBE_BADGE__ = function (text) {
        try {
            if (localStorage.getItem(BADGE_KEY) === 'off') return;
        } catch (ignored) {
            // Show the badge when storage cannot be read.
        }
        if (currentBadge && currentBadge.parentNode) {
            currentBadge.parentNode.removeChild(currentBadge);
        }
        var badge = document.createElement('div');
        currentBadge = badge;
        badge.setAttribute('aria-hidden', 'true');
        badge.style.cssText =
            'position:fixed;right:24px;bottom:24px;z-index:2147483647;' +
            'pointer-events:none;padding:12px 16px;border-radius:8px;' +
            'background:rgba(0,0,0,0.8);color:#fff;font:20px/1.4 sans-serif;' +
            'white-space:pre';
        badge.textContent = text;
        document.documentElement.appendChild(badge);
        setTimeout(function () {
            if (badge.parentNode) badge.parentNode.removeChild(badge);
        }, BADGE_MS);
    };

    function showBadge() {
        window.__TIZEN_PROBE_BADGE__(
            'Startup ' +
                result.engine +
                (result.tizen ? ', Tizen ' + result.tizen : '') +
                '\nfirst render ' +
                seconds(result.firstRender) +
                '   ready ' +
                seconds(result.appReady) +
                (result.appReadyCapped ? ' (cap)' : '') +
                '\nheap ' +
                (result.heapMb === null ? '?' : result.heapMb + ' MB') +
                '   errors ' +
                result.errors.length
        );
    }

    function seconds(ms) {
        return ms === null ? '?' : (ms / 1000).toFixed(2) + ' s';
    }
})();
