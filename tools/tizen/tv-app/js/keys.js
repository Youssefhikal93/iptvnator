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

    // A held OK shows how long is left: a thin bar on the pressed card (or
    // along the bottom of the player) fills over HOLD_MS and is gone when OK
    // is let go or the hold fires. It floats above the page, so a screen that
    // redraws during the hold cannot lose it; its box is read once per press.
    var bar = null;

    function showBar(target) {
        var node = typeof target === 'function' ? target() : target;
        if (!node || !node.getBoundingClientRect) return;
        var art = (node.querySelector && node.querySelector('.hm-poster, .poster, .pf-avatar')) || node;
        var box = art.getBoundingClientRect();
        if (!box.width || !box.height) return;
        var inset = Math.round(Math.min(16, box.height / 8));
        var width = box.width > 1200 ? 480 : box.width - 2 * inset;
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'hold-progress';
            bar.style.setProperty('--hold-ms', HOLD_MS + 'ms');
            document.body.appendChild(bar);
        }
        bar.style.left = Math.round(box.left + (box.width - width) / 2) + 'px';
        bar.style.top = Math.round(box.bottom - inset - 6) + 'px';
        bar.style.width = Math.round(width) + 'px';
        // A new fill starts its animation from empty.
        bar.innerHTML = '<i></i>';
        bar.className = 'on';
    }

    function hideBar() {
        if (!bar) return;
        bar.className = '';
        bar.innerHTML = '';
    }

    function cancel() {
        if (pending) clearTimeout(pending.timer);
        pending = null;
        hideBar();
    }

    keys.isBack = function (code) {
        return code === keys.RETURN || code === keys.BACKSPACE || code === keys.ESCAPE;
    };

    // target: the element, or a function returning it, the bar is drawn on.
    keys.press = function (tap, hold, target) {
        cancel();
        var press = { fired: false, tap: tap };
        press.timer = setTimeout(function () {
            press.fired = true;
            hideBar();
            hold();
        }, HOLD_MS);
        pending = press;
        if (target) showBar(target);
    };

    keys.HOLD_MS = HOLD_MS;

    // The focused card or row of a screen, for the bar.
    keys.focusedIn = function (id) {
        return function () {
            var root = document.getElementById(id);
            return root && root.querySelector('.focus, .focused');
        };
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
