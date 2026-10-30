// Remote codes and the single pending OK press, shared by all screens.
window.Keys = (function () {
    'use strict';

    var HOLD_MS = 600;
    var pending = null;
    var keys = {
        LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
        RETURN: 10009, BACKSPACE: 8, ESCAPE: 27,
        CH_UP: 427, CH_DOWN: 428, PREVIOUS_CHANNEL: 10190,
        GREEN: 404, YELLOW: 405, BLUE: 406, INFO: 457,
        STOP: 413, PLAY_PAUSE: 10252, PLAY: 415, PAUSE: 19,
        FAST_FORWARD: 417, REWIND: 412, IME_DONE: 65376, IME_CANCEL: 65385,
    };

    function cancel() {
        if (pending) clearTimeout(pending.timer);
        pending = null;
    }

    keys.isBack = function (code) {
        return code === keys.RETURN || code === keys.BACKSPACE || code === keys.ESCAPE;
    };

    keys.press = function (tap, hold) {
        cancel();
        var press = { fired: false, tap: tap };
        press.timer = setTimeout(function () {
            press.fired = true;
            hold();
        }, HOLD_MS);
        pending = press;
    };

    // This must run before menus: a held OK must not activate the menu it opens.
    keys.repeat = function (code) {
        if (!pending) return false;
        if (code === keys.ENTER) return true;
        cancel();
        return false;
    };

    document.addEventListener('keyup', function (event) {
        var press = pending;
        if (!press || event.keyCode !== keys.ENTER) return;
        cancel();
        if (!press.fired) press.tap();
    });

    return keys;
})();
