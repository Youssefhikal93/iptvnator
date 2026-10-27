// A load owns one retry schedule. Pausing keeps the remaining delay, so
// returning from playback does not send a burst of overdue requests.
window.Retry = function (options) {
    'use strict';

    var delays = [2, 5, 10, 30];
    var count = 0;
    var remaining = null;
    var since = 0;
    var timer = null;
    var paused = false;
    var running = false;
    var finished = false;
    var failure = null;
    var complete;
    var promise = new Promise(function (resolve) { complete = resolve; });

    function changed() {
        options.changed({ error: failure, seconds: remaining === null ? null : Math.ceil(remaining / 1000), running: running });
    }

    function schedule() {
        changed();
        if (paused || finished || remaining === null) return;
        since = Date.now();
        timer = setTimeout(function () {
            remaining = Math.max(0, remaining - (Date.now() - since));
            if (!remaining) run();
            else schedule();
        }, Math.min(1000, remaining));
    }

    function run() {
        if (running || finished || paused) return;
        clearTimeout(timer);
        remaining = null;
        running = true;
        changed();
        Promise.resolve().then(options.load).then(function (loaded) {
            if (finished) return;
            finished = true;
            running = false;
            count = 0;
            failure = null;
            changed();
            complete(loaded);
        }, function (err) {
            if (finished) return;
            running = false;
            failure = err;
            // A busy source (429) asks for its rest: wait it out, then try again.
            if (err && err.code === 'busy') remaining = Math.max(1000, err.wait || 0);
            else remaining = count < delays.length ? delays[count++] * 1000 : null;
            schedule();
        });
    }

    return {
        promise: promise,
        now: run,
        pause: function () {
            if (paused) return;
            paused = true;
            clearTimeout(timer);
            if (remaining !== null) remaining = Math.max(0, remaining - (Date.now() - since));
            changed();
        },
        resume: function () {
            if (!paused) return;
            paused = false;
            schedule();
        },
        cancel: function () {
            finished = true;
            clearTimeout(timer);
        },
    };
};
