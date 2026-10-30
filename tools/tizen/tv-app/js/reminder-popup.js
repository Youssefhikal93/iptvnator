// The pop-up a minute before a reminded programme starts (#75), over any
// screen. Watch now plays the channel, Dismiss closes it; left alone it
// closes when the programme starts and nothing else changes.
//
// ReminderPopup(hooks) -> { isOpen, onKey }
//   hooks.allowed() -> false while another screen must not be covered
//   hooks.watch(reminder) plays the reminder's channel
window.ReminderPopup = function (hooks) {
    'use strict';

    var el = document.getElementById('reminder-popup');
    var shown = null;
    var focus = 0;

    function node(tag, className, text) {
        var child = document.createElement(tag);
        child.className = className;
        if (text !== undefined) child.textContent = text;
        return child;
    }

    function draw() {
        el.innerHTML = '';
        var card = node('div', 'gd-popup-card');
        card.appendChild(node('h2', '', I18n.t('reminders.starts', { title: shown.title, channel: shown.channel.name })));
        card.appendChild(node('p', 'gd-popup-time', I18n.time(shown.start) + ' - ' + I18n.time(shown.end)));
        var buttons = node('div', 'rm-buttons');
        [I18n.t('reminders.watch'), I18n.t('reminders.dismiss')].forEach(function (label) {
            buttons.appendChild(node('button', 'state-button gd-watch', label));
        });
        card.appendChild(buttons);
        el.appendChild(card);
        buttons.childNodes[focus].focus();
    }

    function hide() {
        shown = null;
        el.classList.add('hidden');
    }

    function show(entry) {
        shown = entry;
        focus = 0;
        el.classList.remove('hidden');
        draw();
    }

    function tick() {
        var now = Date.now();
        if (shown && now >= shown.start) hide();
        if (!shown && hooks.allowed()) {
            var entry = Reminders.due(now);
            if (entry) show(entry);
        }
    }

    setInterval(tick, 1000);

    return {
        isOpen: function () { return !!shown; },
        onKey: function (code) {
            if (code === Keys.LEFT || code === Keys.RIGHT || code === Keys.UP || code === Keys.DOWN) {
                focus = 1 - focus;
                draw();
            } else if (code === Keys.ENTER) {
                var entry = shown;
                hide();
                if (focus === 0) hooks.watch(entry);
            } else if (Keys.isBack(code)) hide();
            return true;
        },
    };
};
