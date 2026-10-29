// How long a key press takes on the TV, from the key to the next drawn frame
// (#53): one log line per 20 presses on a screen, for before/after numbers.
//
// measure(screen, run) runs the key's handler and returns what it returns.
window.KeyTiming = (function () {
    'use strict';

    var EVERY = 20;
    var times = {};

    function note(screen, ms) {
        var list = times[screen] = times[screen] || [];
        list.push(ms);
        if (list.length < EVERY) return;
        list.sort(function (a, b) { return a - b; });
        Log.info('KEYS ' + screen + ' ' + list.length + ', median ' + list[list.length >> 1].toFixed(1) + ' ms, max ' + list[list.length - 1].toFixed(1) + ' ms');
        times[screen] = [];
    }

    function measure(screen, run) {
        var started = performance.now();
        var result = run();
        // A task queued from the next frame runs once that frame is drawn.
        requestAnimationFrame(function () {
            setTimeout(function () { note(screen, performance.now() - started); }, 0);
        });
        return result;
    }

    return { measure: measure };
})();
