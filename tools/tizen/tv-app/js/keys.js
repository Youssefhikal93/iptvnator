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

    // A held OK shows how long is left: a small ring in the top corner of the
    // pressed card (larger, near the bottom of the player) fills clockwise
    // until the hold fires and is gone when OK is let go. It appears only
    // after RING_DELAY_MS, so a plain tap draws nothing. It floats above the
    // page, so a screen that redraws during the hold cannot lose it; its box
    // is read once per press. On small art (a channel's logo plate, a Wide
    // box's poster) it sits in the middle, clear of the corner badges.
    var CARD_RING = 44;
    var PLAYER_RING = 72;
    var PLAYER_GAP = 148;
    var RING_DELAY_MS = 180;
    var SMALL_ART = 3 * CARD_RING;
    // The arc is drawn by its dash: a circle of radius 18 in a 44 box.
    var RING = '<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="hp-track" cx="22" cy="22" r="18"></circle>' +
        '<circle class="hp-arc" cx="22" cy="22" r="18" transform="rotate(-90 22 22)"></circle></svg>';
    var bar = null;

    // The app does not mirror its layout yet; Arabic still puts the ring on the reading side.
    function rightToLeft() {
        var root = document.documentElement;
        return (root && root.dir === 'rtl') || (!!window.I18n && I18n.language() === 'ar');
    }

    function showBar(target) {
        var node = typeof target === 'function' ? target() : target;
        if (!node || !node.getBoundingClientRect) return;
        var art = (node.querySelector && node.querySelector('.hm-poster, .poster, .pf-avatar, .plate')) || node;
        var box = art.getBoundingClientRect();
        if (!box.width || !box.height) return;
        var player = box.width > 1200;
        var size = player ? PLAYER_RING : CARD_RING;
        var small = !player && box.width < SMALL_ART;
        var inset = Math.round(Math.min(16, box.height / 8));
        var left = player || small ? box.left + (box.width - size) / 2 : rightToLeft() ? box.left + inset : box.right - inset - size;
        // On the player, above the row of key hints along its bottom.
        var top = player ? box.bottom - size - PLAYER_GAP : small ? box.top + (box.height - size) / 2 : box.top + inset;
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'hold-progress';
            // The ring fills over what is left of the hold once it shows.
            bar.style.setProperty('--hold-ms', (HOLD_MS - RING_DELAY_MS) + 'ms');
            document.body.appendChild(bar);
        }
        bar.style.left = Math.round(left) + 'px';
        bar.style.top = Math.round(top) + 'px';
        bar.style.width = size + 'px';
        bar.style.height = size + 'px';
        // A new ring starts its animation from empty.
        bar.innerHTML = RING;
        bar.className = 'on';
    }

    function hideBar() {
        if (!bar) return;
        bar.className = '';
        bar.innerHTML = '';
    }

    function cancel() {
        if (pending) {
            clearTimeout(pending.timer);
            clearTimeout(pending.ring);
        }
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
        if (target) press.ring = setTimeout(function () { if (pending === press) showBar(target); }, RING_DELAY_MS);
    };

    keys.HOLD_MS = HOLD_MS;
    keys.RING_DELAY_MS = RING_DELAY_MS;

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
