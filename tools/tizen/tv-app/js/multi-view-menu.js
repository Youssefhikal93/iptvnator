window.MultiViewMenu = function (hooks) {
    'use strict';

    var root = document.getElementById('pl-menu');
    var opened = false;
    var owned = null;
    var generation = 0;

    function sheet(title, choices) {
        var mine = ++generation;
        owned = Menu.open(title, choices.map(function (choice) {
            return { label: choice.label, icon: choice.icon, run: function () {
                if (mine === generation) choice.run();
            } };
        }));
        document.getElementById('menu').classList.add('multi-view-sheet');
    }

    function layout() {
        Player.dismissMenu();
        close();
        sheet(I18n.t('multi.layout'), MultiViewState.layouts().map(function (count) {
            return { label: I18n.t('multi.tiles', { n: count }), icon: '▦', run: function () { hooks.layout(count); } };
        }));
    }

    function options() {
        var channel = hooks.channel();
        if (!channel) return hooks.pick();
        var choices = [
            { label: I18n.t('multi.fullscreen'), icon: '⛶', run: hooks.leave },
            { label: I18n.t('multi.change'), icon: '⇄', run: hooks.pick },
            { label: I18n.t('multi.main'), icon: '★', run: hooks.main },
            { label: I18n.t('multi.remove'), icon: '✕', run: hooks.remove },
        ];
        if (hooks.refused()) choices.unshift({ label: I18n.t('multi.retry'), icon: '↻', run: hooks.retry });
        sheet(I18n.isolate(channel.name), choices);
    }

    function trackEntries(entries, type, label, empty) {
        entries.head(I18n.t(label));
        var engine = hooks.engine();
        var tracks = engine ? engine.tracks()[type] : [];
        tracks.forEach(function (track) {
            entries.item(track.label, track.active, function () { engine.select(type, track.ref); });
        });
        if (!tracks.length) entries.note(I18n.t(empty));
    }

    var panel = PlayerMenu(root, {
        title: function () { return I18n.t('multi.title'); },
        run: function (action) { action(); },
        build: function (entries) {
            entries.item(I18n.t('multi.layout'), false, layout, null, '▦');
            entries.item(I18n.t('multi.leave'), false, hooks.leave, null, '⛶');
            entries.item(I18n.t('help.title'), false, function () { owned = KeyHelp.open(help()); });
            trackEntries(entries, 'audio', 'player.audio', 'player.oneAudio');
            trackEntries(entries, 'text', 'picture.subtitles', 'player.noSubtitles');
            Player.sleepEntries(entries);
        },
    });

    function help() {
        return [
            ['multi.keys.arrows', 'multi.help.focus'],
            ['help.key.ok', 'multi.help.options'],
            ['help.key.holdOk', 'help.player.menu'],
            ['help.key.yellowInfo', 'help.player.menu'],
            ['multi.keys.ch', 'multi.help.zap'],
            ['help.key.return', 'multi.help.leave'],
        ];
    }

    function close() {
        generation++;
        if (owned && owned()) Menu.close();
        owned = null;
        opened = false;
        root.classList.add('hidden');
        document.getElementById('player').classList.remove('menu-on');
    }

    return {
        layout: layout,
        options: options,
        close: close,
        isOpen: function () { return opened; },
        open: function () {
            opened = true;
            panel.reset();
            panel.render();
            root.classList.remove('hidden');
            document.getElementById('player').classList.add('menu-on');
        },
        key: function (code) {
            if (code === Keys.YELLOW || code === Keys.INFO || panel.key(code) === 'close') close();
            else if (opened) panel.render();
            return true;
        },
    };
};
