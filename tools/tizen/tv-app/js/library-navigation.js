// A library pick keeps its list underneath playback while the source changes.
window.LibraryNavigation = function (hooks) {
    'use strict';

    var pending = false;
    var generation = 0;
    var timer = null;

    function cancel() {
        generation++;
        pending = false;
        clearTimeout(timer);
    }

    function open(item, run) {
        if (pending) return;
        if (!item.sourceId || item.sourceId === hooks.current()) return run();
        var source = Sources.all().filter(function (saved) { return saved.id === item.sourceId; })[0];
        if (!source) return hooks.refresh();
        var view = hooks.capture();
        var mine = ++generation;
        var ready = false;
        pending = true;
        // ADR 0006: release even a live preview before setting up the adapter.
        hooks.stop();
        Player.stop();
        var account = hooks.switchSource(source, function () { return ready || !pending || mine !== generation; });
        timer = setTimeout(function () {
            ready = true;
            LoadScreen.render();
        }, 1000);
        // M3U learns its sections during the account load, before restoring one.
        account.then(function () {
            if (mine !== generation || hooks.current() !== source.id) return;
            return hooks.restore(view, item).then(function () {
                if (mine !== generation || hooks.current() !== source.id) return;
                cancel();
                LoadScreen.render();
                run();
            });
        });
    }

    return { open: open, busy: function () { return pending; }, cancel: cancel };
};
