// Keep progress protected until a later engine time update confirms the seek.
window.PlayerResume = function (api) {
    'use strict';

    var POLL_MS = 250;
    var RETRY_MS = 750;
    var DEADLINE_MS = 30000;
    var TOLERANCE_MS = 5000;
    var timer = null;
    var target = null;
    var from = 0;
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

    // Samsung's player lands on a key frame near the target, not on it: a
    // position that moved most of the way there counts as arrived. A seek the
    // player ignored leaves it where it was, and that one is sent again.
    function arrived(pos) {
        if (!isFinite(pos)) return false;
        var off = Math.abs(pos - target);
        return off <= TOLERANCE_MS || off < Math.abs(from - target) / 2;
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
        // A settled seek that already reports the target is done; seeking again restarts AVPlay's buffering.
        var pos = api.position();
        if (attempted && arrived(pos)) return cancel();
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
            from = api.position();
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
            if (api.pending() || !arrived(pos)) return;
            cancel();
        },
    };
};
