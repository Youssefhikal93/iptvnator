// Uses Home's TV input and virtual rows, and the shared programme action sheet.
window.ProgrammeSearch = function (hooks) {
    'use strict';

    var root = document.getElementById('programme-search');
    var session = null;
    var home = Home({
        hero: function () { return []; },
        rows: function () { return []; },
        searchPlaceholder: 'programmeSearch.title',
        searchHint: 'programmeSearch.hint',
        search: function (query) {
            return session.index.then(function (index) {
                var groups = ProgrammeMatch.search(index, query, Date.now());
                var titles = { now: 'programmeSearch.now', today: 'programmeSearch.today',
                    coming: 'programmeSearch.coming', past: 'programmeSearch.past' };
                return Object.keys(titles).filter(function (group) { return groups[group].length; }).map(function (group) {
                    return { id: group, title: I18n.t(titles[group]), live: true, entries: groups[group].map(function (entry) {
                        return { item: entry.channel, section: 'live', programme: entry.programme };
                    }) };
                });
            });
        },
    }, root);

    function close() {
        home.reset();
        root.classList.add('hidden');
        var done = session.done;
        session = null;
        done();
    }

    function play(entry, archive) {
        root.classList.add('hidden');
        session.suspended = true;
        if (archive) hooks.catchUp(entry.item, entry.programme);
        else hooks.play(entry.item);
    }

    function actions(entry) {
        if (!hooks.allows(entry.item)) return;
        var programme = entry.programme;
        var now = Date.now();
        var options = [];
        if (programme.start <= now && now < programme.end) {
            options.push({ label: I18n.t('reminders.watch'), run: function () { play(entry, false); } });
        }
        if (CatchUp.playable(entry.item, programme)) {
            options.push({ label: I18n.t('player.watchFromStart'), run: function () { play(entry, true); } });
        }
        if (programme.start > now) {
            var reminded = Reminders.has(session.sourceId, entry.item, programme);
            options.push({ label: I18n.t(reminded ? 'reminders.remove' : 'reminders.add'), run: function () {
                if (reminded) Reminders.remove(session.sourceId, entry.item, programme);
                else Reminders.add(session.sourceId, entry.item, programme);
                actions(entry);
            } });
        }
        if (!options.length) options.push({ label: I18n.t('guide.popupHint') });
        Menu.open(programme.title, options, 0, { sub: entry.item.name + ' \u00b7 ' + I18n.time(programme.start) });
    }

    return {
        open: function (options) {
            session = { sourceId: options.sourceId, done: options.done, suspended: false,
                index: options.schedules.then(ProgrammeMatch.index) };
            home.reset();
            root.classList.remove('hidden');
            home.setActive(true);
            home.openSearch();
        },
        isOpen: function () { return !!session; },
        key: function (code) {
            if (home.typing()) return home.key(code);
            if (Keys.isBack(code)) { close(); return true; }
            var entry = home.focused();
            if (code === Keys.ENTER && entry) actions(entry);
            else home.key(code);
            return true;
        },
        close: close,
        resume: function () {
            if (!session || !session.suspended) return;
            session.suspended = false;
            root.classList.remove('hidden');
            home.render();
        },
    };
};
