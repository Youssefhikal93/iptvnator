window.MultiViewMenu = function (hooks) {
    'use strict';

    var root = document.getElementById('pl-menu');
    var opened = false;

    function layout() {
        Player.dismissMenu();
        close();
        Menu.open(I18n.t('multi.layout'), MultiViewState.layouts().map(function (count) {
            return { label: I18n.t('multi.tiles', { n: count }), run: function () { hooks.layout(count); } };
        }));
    }

    function options() {
        var channel = hooks.channel();
        if (!channel) return hooks.pick();
        var choices = [
            { label: I18n.t('multi.fullscreen'), run: hooks.leave },
            { label: I18n.t('multi.change'), run: hooks.pick },
            { label: I18n.t('multi.main'), run: hooks.main },
            { label: I18n.t('multi.remove'), run: hooks.remove },
        ];
        if (hooks.refused()) choices.unshift({ label: I18n.t('multi.retry'), run: hooks.retry });
        Menu.open(I18n.isolate(channel.name), choices);
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
            entries.item(I18n.t('multi.layout'), false, layout);
            entries.item(I18n.t('multi.leave'), false, hooks.leave);
            entries.item(I18n.t('help.title'), false, function () { KeyHelp.open(help()); });
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
