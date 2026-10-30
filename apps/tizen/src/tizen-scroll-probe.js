/* eslint-disable no-var, @typescript-eslint/no-unused-vars -- ES5 on purpose, like tizen-startup-probe.js. */
/*
 * IPTVnator Tizen scroll probe (phase 0, issue #18).
 *
 * The first time per app start that a channel list with at least MIN_ROWS
 * rows is open (the largest cdk-virtual-scroll-viewport) and the page has
 * been idle for IDLE_MS, it scrolls that list by itself and measures the
 * gaps between animation frames:
 *   fling  FLING_PX per frame for 4 s (a fast continuous scroll)
 *   dpad   one row every 100 ms for 4 s (a held remote arrow key)
 *   jump   to the end of the list, time until the next two frames
 * "freeze" is any frame gap of FREEZE_MS or more.
 *
 * Results: console line "[tizen-scroll] {json}", window.__TIZEN_SCROLL__,
 * localStorage "iptvnator-tizen-scroll" (last five) and the badge. Disable:
 * localStorage "iptvnator-tizen-scroll-bench" = "off". It records numbers
 * only, never channel names or URLs.
 */
(function () {
    'use strict';
    var MIN_ROWS = 5000;
    var IDLE_MS = 3000;
    var PHASE_MS = 4000;
    var FLING_PX = 120;
    var FREEZE_MS = 500;
    var STORE_KEY = 'iptvnator-tizen-scroll';
    var OFF_KEY = 'iptvnator-tizen-scroll-bench';
    var started = false;

    function disabled() {
        try {
            return localStorage.getItem(OFF_KEY) === 'off';
        } catch (ignored) {
            return false;
        }
    }

    function largestList() {
        var lists = document.querySelectorAll('cdk-virtual-scroll-viewport');
        var best = null;
        for (var i = 0; i < lists.length; i += 1) {
            if (!best || lists[i].clientHeight > best.clientHeight)
                best = lists[i];
        }
        return best;
    }

    function rowHeight(list) {
        var row = list.querySelector('.cdk-virtual-scroll-content-wrapper > *');
        return (row && row.getBoundingClientRect().height) || 48;
    }

    function frames(durationMs, step, done) {
        var gaps = [];
        var start = null;
        var last = null;
        function tick(time) {
            if (start === null) start = last = time;
            else gaps.push(time - last);
            last = time;
            step(time - start);
            if (time - start < durationMs) requestAnimationFrame(tick);
            else done(summary(gaps));
        }
        requestAnimationFrame(tick);
    }

    function summary(gaps) {
        var sorted = gaps.slice().sort(function (a, b) {
            return a - b;
        });
        var total = 0;
        for (var i = 0; i < gaps.length; i += 1) total += gaps[i];
        var max = sorted.length ? sorted[sorted.length - 1] : 0;
        return {
            fps: total ? Math.round((gaps.length / total) * 1000) : 0,
            p95FrameMs: Math.round(
                sorted[Math.floor(sorted.length * 0.95)] || 0
            ),
            maxFrameMs: Math.round(max),
            freezes: gaps.filter(function (gap) {
                return gap >= FREEZE_MS;
            }).length,
        };
    }

    function run(done) {
        var list = largestList();
        if (!list) return done({ error: 'no channel list' });
        var height = rowHeight(list);
        var result = { rows: Math.round(list.scrollHeight / height) };
        list.scrollTop = 0;
        frames(
            PHASE_MS,
            function () {
                list.scrollTop += FLING_PX;
            },
            function (fling) {
                result.fling = fling;
                var nextStep = 0;
                frames(
                    PHASE_MS,
                    function (elapsed) {
                        if (elapsed >= nextStep) {
                            list.scrollTop += height;
                            nextStep += 100;
                        }
                    },
                    function (dpad) {
                        result.dpad = dpad;
                        var jumpStart = performance.now();
                        list.scrollTop = list.scrollHeight;
                        requestAnimationFrame(function () {
                            requestAnimationFrame(function () {
                                result.jumpToEndMs = Math.round(
                                    performance.now() - jumpStart
                                );
                                result.freeze =
                                    result.fling.freezes + result.dpad.freezes >
                                        0 || result.jumpToEndMs >= FREEZE_MS;
                                done(result);
                            });
                        });
                    }
                );
            }
        );
    }

    function report(result) {
        window.__TIZEN_SCROLL__ = result;
        if (window.console && console.log) {
            console.log('[tizen-scroll] ' + JSON.stringify(result));
        }
        try {
            var runs = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
            runs.unshift({ at: new Date().toISOString(), result: result });
            localStorage.setItem(STORE_KEY, JSON.stringify(runs.slice(0, 5)));
        } catch (ignored) {
            // Storage may be unavailable; the console line still has the data.
        }
        if (window.__TIZEN_PROBE_BADGE__ && !result.error) {
            window.__TIZEN_PROBE_BADGE__(
                'Scroll ' +
                    result.rows +
                    ' rows: ' +
                    (result.freeze ? 'FREEZE' : 'no freeze') +
                    '\nfling ' +
                    result.fling.fps +
                    ' fps (max frame ' +
                    result.fling.maxFrameMs +
                    ' ms)' +
                    '\nremote ' +
                    result.dpad.fps +
                    ' fps (max frame ' +
                    result.dpad.maxFrameMs +
                    ' ms)' +
                    '\njump to end ' +
                    result.jumpToEndMs +
                    ' ms'
            );
        }
    }

    var lastChange = 0;
    var observer = null;
    function watch() {
        if (started || disabled()) return observer.disconnect();
        var list = largestList();
        var ready = list && list.scrollHeight / rowHeight(list) >= MIN_ROWS;
        if (ready && performance.now() - lastChange >= IDLE_MS) {
            started = true;
            observer.disconnect();
            run(report);
            return;
        }
        setTimeout(watch, 500);
    }

    document.addEventListener('DOMContentLoaded', function () {
        observer = new MutationObserver(function () {
            lastChange = performance.now();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        watch();
    });
})();
