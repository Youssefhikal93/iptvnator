// Session-only deadlines. Media time owns end-of-item choices, so pausing,
// seeking and changing playback speed cannot turn them into wall-clock timers.
window.SleepTimer = function (api) {
    'use strict';

    var clock = api.clock || {
        now: function () { return Date.now(); },
        setTimeout: function (callback, delay) { return setTimeout(callback, delay); },
        clearTimeout: function (id) { clearTimeout(id); },
    };
    var choice = 0;
    var deadline = 0;
    var timer = null;

    function remaining() {
        if (!choice) return null;
        if (choice !== 'end') return Math.max(0, deadline - clock.now());
        var media = api.media();
        if (!media) return null;
        if (media.ended) return 0;
        if (!(media.duration > 0)) return null;
        return Math.max(0, (media.duration - media.position) / media.rate);
    }

    function state() {
        var left = remaining();
        return { choice: choice, remaining: left, warning: !!choice && left !== null && left <= 60000 };
    }

    function cancel() {
        clock.clearTimeout(timer);
        timer = null;
        choice = 0;
        deadline = 0;
        api.change(state());
    }

    function stopNow() {
        cancel();
        api.stop();
    }

    function check() {
        clock.clearTimeout(timer);
        timer = null;
        var snapshot = state();
        if (snapshot.choice && snapshot.remaining === 0) return stopNow();
        api.change(snapshot);
        if (choice) timer = clock.setTimeout(check, 1000);
    }

    function select(nextChoice) {
        choice = nextChoice;
        deadline = choice && choice !== 'end' ? clock.now() + choice * 60000 : 0;
        check();
    }

    function keepWatching() {
        if (choice === 'end') return cancel();
        if (!choice) return;
        deadline += choice * 60000;
        check();
    }

    return { select: select, cancel: cancel, check: check, keepWatching: keepWatching, stopNow: stopNow };
};
