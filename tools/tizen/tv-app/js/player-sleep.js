// The warning takes key priority over menus, channel zapping and Up next.
window.PlayerSleep = function (api) {
    'use strict';

    function node(tag, id, text) {
        var element = document.createElement(tag);
        element.id = id;
        if (text) element.textContent = text;
        return element;
    }

    var badge = node('span', 'pl-sleep-badge');
    badge.className = 'pl-chip hidden';
    document.querySelector('#pl-controls .pl-top').appendChild(badge);
    var warning = node('div', 'pl-sleep-warning');
    warning.className = 'hidden';
    warning.setAttribute('role', 'alertdialog');
    warning.setAttribute('aria-modal', 'true');
    warning.setAttribute('aria-labelledby', 'pl-sleep-count');
    var count = node('div', 'pl-sleep-count');
    var buttons = node('div', 'pl-sleep-buttons');
    var keep = node('button', 'pl-sleep-keep', 'Keep watching');
    var stop = node('button', 'pl-sleep-stop', 'Stop now');
    warning.appendChild(count);
    warning.appendChild(buttons);
    buttons.appendChild(keep);
    buttons.appendChild(stop);
    document.getElementById('player').appendChild(warning);
    var shown = false;
    var focus = 0;
    var snapshot = { choice: 0, remaining: null, warning: false };
    var timer = SleepTimer({ media: api.media, change: render, stop: api.stop });

    function minutes() {
        return Math.ceil(snapshot.remaining / 60000);
    }

    function heading() {
        return 'Sleep timer' + (snapshot.choice && snapshot.remaining !== null ? ' · ' + minutes() + ' min left' : '');
    }

    function focusButton() {
        keep.className = focus === 0 ? 'focus' : '';
        stop.className = focus === 1 ? 'focus' : '';
        (focus === 0 ? keep : stop).focus();
    }

    function render(next) {
        snapshot = next;
        badge.classList.toggle('hidden', !next.choice);
        badge.textContent = next.remaining === null ? 'Sleep at end' : 'Sleep in ' + minutes() + ' min';
        var head = document.querySelector('.pl-sleep-head');
        if (head) head.textContent = heading();
        warning.classList.toggle('hidden', !next.warning);
        if (next.warning) count.textContent = 'Playback stops in ' + Math.ceil(next.remaining / 1000) + ' s';
        if (next.warning && !shown) {
            api.warn();
            focus = 0;
            focusButton();
        } else if (!next.warning && shown) (focus === 0 ? keep : stop).blur();
        shown = next.warning;
    }

    function warningKey(event) {
        if (!shown) return;
        var code = event.keyCode;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (Keys.isBack(code)) timer.keepWatching();
        else if (code === Keys.STOP) timer.stopNow();
        else if (code === Keys.ENTER) (focus === 0 ? timer.keepWatching : timer.stopNow)();
        else if (code === Keys.LEFT || code === Keys.RIGHT || code === Keys.UP || code === Keys.DOWN) {
            focus = code === Keys.LEFT || code === Keys.UP ? 0 : 1;
            focusButton();
        }
    }

    document.addEventListener('keydown', warningKey, true);
    keep.onclick = timer.keepWatching;
    stop.onclick = timer.stopNow;

    return {
        cancel: timer.cancel,
        check: timer.check,
        blocksAutoplay: function () { return snapshot.choice === 'end' || shown; },
        heading: heading,
        choices: function (request) {
            var choices = [0, 15, 30, 60, 90];
            if (!request.live) choices.push('end');
            return choices.map(function (choice) {
                return {
                    label: choice === 'end' ? 'End of ' + (request.episodes ? 'episode' : 'movie') : choice ? choice + ' min' : 'Off',
                    active: choice === snapshot.choice,
                    select: function () { timer.select(choice); },
                };
            });
        },
    };
};
