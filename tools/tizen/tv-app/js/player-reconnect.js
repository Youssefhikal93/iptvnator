// Brings a dropped live stream back without the viewer reopening the channel.
// A loss (stream error, or no progress for STALL_MS) closes the old stream,
// waits a backoff delay and opens it again, up to DELAYS.length times; then
// the player shows its error screen. The player closes the old stream before
// every try (ADR 0006), so a one-connection account never sees two. Timers
// are injectable so the state machine is unit-testable.
//
// api: begin(reason) shows "Reconnecting…" and closes the stream;
// open(done) makes one try and calls done(null) when playing or done(reason);
// giveUp(reason) shows the error; position() and paused() feed the stall check.
// Tests may shorten the timings with window.TV_TEST_RECONNECT.
window.PlayerReconnect = function (api) {
    'use strict';

    var settings = api.settings || window.TV_TEST_RECONNECT || {};
    var DELAYS = settings.delays || [1000, 2000, 4000, 8000, 15000];
    var STALL_MS = settings.stallMs || 10000;
    var STABLE_MS = settings.stableMs || 30000; // playing this long forgives earlier tries
    var CHECK_MS = settings.checkMs || 1000;
    var clock = api.timers || {
        now: function () { return Date.now(); },
        setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
        clearTimeout: function (id) { clearTimeout(id); },
        setInterval: function (fn, ms) { return setInterval(fn, ms); },
        clearInterval: function (id) { clearInterval(id); },
    };

    var tries = 0;
    var active = false;
    var generation = 0; // a cancelled outage must ignore its late callbacks
    var retryTimer = null;
    var stableTimer = null;
    var watchTimer = null;
    var lastPosition = null;
    var lastMove = 0;

    function unwatch() {
        if (watchTimer === null) return;
        clock.clearInterval(watchTimer);
        watchTimer = null;
    }

    function clearTimers() {
        unwatch();
        clock.clearTimeout(retryTimer);
        clock.clearTimeout(stableTimer);
        retryTimer = stableTimer = null;
    }

    function giveUp(reason) {
        active = false;
        tries = 0; // Retry playback starts with a fresh budget.
        api.giveUp(reason);
    }

    function schedule() {
        var mine = generation;
        retryTimer = clock.setTimeout(function () {
            retryTimer = null;
            api.open(function (error) {
                if (mine !== generation) return;
                if (!error) {
                    active = false;
                    stableTimer = clock.setTimeout(function () {
                        stableTimer = null;
                        tries = 0;
                    }, STABLE_MS);
                } else if (tries >= DELAYS.length) giveUp(error);
                else schedule();
            });
        }, DELAYS[tries++]);
    }

    function lost(reason) {
        if (active) return;
        clearTimers();
        if (tries >= DELAYS.length) return giveUp(reason);
        active = true;
        api.begin(reason);
        schedule();
    }

    function check() {
        var now = clock.now();
        var position = api.position();
        if (api.paused() || position !== lastPosition) {
            lastPosition = position;
            lastMove = now;
        } else if (now - lastMove >= STALL_MS) lost('stalled');
    }

    return {
        lost: lost,
        // Call once a stream plays: watches for buffering that never ends.
        watch: function () {
            unwatch();
            lastPosition = api.position();
            lastMove = clock.now();
            watchTimer = clock.setInterval(check, CHECK_MS);
        },
        unwatch: unwatch,
        // A new channel, Back or leaving drops any reconnecting in progress.
        cancel: function () {
            generation++;
            active = false;
            tries = 0;
            clearTimers();
        },
        isActive: function () {
            return active;
        },
    };
};
