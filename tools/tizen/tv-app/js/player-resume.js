// Keep progress protected until a later engine time update confirms the seek.
window.PlayerResume = function (api) {
    'use strict';

    var POLL_MS = 250;
    var RETRY_MS = 750;
    var DEADLINE_MS = 30000;
    var TOLERANCE_MS = 5000;
    var timer = null;
    var target = null;
    var deadline = 0;
    var lastAttempt = null;
    var attempted = false;
    var blocked = false;

    function cancel() {
        clearInterval(timer);
        timer = null;
        target = null;
        blocked = false;
    }

    function poll() {
        var now = Date.now();
        if (now >= deadline) {
            cancel();
            blocked = true; // Leaving after a timeout must keep the saved progress.
            api.timeout();
            return;
        }
        if (api.pending() || !api.ready(target)) return;
        if (lastAttempt !== null && now - lastAttempt < RETRY_MS) return;
        lastAttempt = now;
        attempted = false;
        api.seekTo(target);
        attempted = true;
    }

    return {
        cancel: cancel,
        blocked: function () {
            return blocked;
        },
        start: function (ms) {
            cancel();
            target = ms;
            blocked = true;
            deadline = Date.now() + DEADLINE_MS;
            lastAttempt = null;
            attempted = false;
            timer = setInterval(poll, POLL_MS);
            poll();
        },
        onTime: function () {
            if (target === null || !attempted) return;
            if (Date.now() >= deadline) return poll();
            var pos = api.position();
            if (api.pending() || !isFinite(pos) || Math.abs(pos - target) > TOLERANCE_MS) return;
            cancel();
        },
    };
};
