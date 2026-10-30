// The Reminders list (#75), in the options sheet: OK on one removes it. The
// first line says reminders only work while the app is open.
// open(toast, done) - done runs when Return closes the list.
window.RemindersList = (function () {
    'use strict';

    function label(entry) {
        var day = I18n.date(entry.start, { weekday: 'short', month: 'short', day: 'numeric' });
        return day + ' ' + I18n.time(entry.start) + ' · ' + entry.title + ' · ' + entry.channel.name;
    }

    function open(toast, done, index) {
        var list = Reminders.list();
        var options = [{ label: I18n.t('reminders.note'), note: true }];
        if (!list.length) options.push({ label: I18n.t('reminders.empty'), note: true });
        list.forEach(function (entry, at) {
            options.push({ label: label(entry), run: function () {
                Reminders.removeId(entry.id);
                toast(I18n.t('reminders.removed'));
                open(toast, done, at);
            } });
        });
        Menu.open(I18n.t('reminders.title'), options, Math.min(list.length, (index || 0) + 1), null, done);
    }

    return { open: open };
})();
