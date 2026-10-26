// Startup and key routing between the browser, the add-source form and the
// full-screen player.
(function () {
    'use strict';

    var KEY = Keys;
    var MEDIA_KEYS = ['ChannelUp', 'ChannelDown', 'PreviousChannel', 'ColorF1Green', 'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'ColorF2Yellow', 'Info'];

    var screen = 'browser';
    // The request on screen: live TV keeps ▲▼ for changing channel.
    var playing = null;

    function exitApp() {
        Player.stop();
        try {
            tizen.application.getCurrentApplication().exit();
        } catch (e) {
            // Not on a TV.
        }
    }

    function play(request) {
        if (!request) return;
        screen = 'player';
        playing = request;
        Player.play(request, null);
        LoadScreen.pause(true);
        channelList.sync();
    }

    // Return from full screen opened on a live preview goes back to the box,
    // with the stream still playing; STOP closes everything.
    function closePlayer(stopped) {
        channelList.close();
        if (!stopped && playing && playing.returnTo && !document.hidden) return play(playing.returnTo);
        if (stopped) preview.stop();
        if (preview.back(playing)) {
            playing = null;
            screen = 'browser';
            LoadScreen.pause(document.hidden);
            return browser.afterPlayback();
        }
        Player.stop();
        playing = null;
        screen = 'browser';
        LoadScreen.pause(document.hidden);
        browser.afterPlayback();
    }

    var preview = null;
    var browser = Browser({
        play: play,
        exit: exitApp,
        preview: {
            open: function (item, list) {
                return preview.open(item, list);
            },
            active: function () {
                return preview.active();
            },
            stop: function () {
                preview.stop();
            },
        },
        openForm: function (kind, done, mode) {
            screen = 'form';
            Form.open(kind, function (source) {
                screen = 'browser';
                done(source);
            }, mode);
        },
    });
    var channelList = ChannelList({ channels: browser.live, epg: browser.epg, play: play, visibility: Player.channelList });
    preview = LivePreview({
        live: browser.live,
        start: Player.play,
        show: Player.preview,
        stop: Player.stop,
        fullscreen: function (request) {
            screen = 'player';
            playing = request;
            Player.fullscreen();
            LoadScreen.pause(true);
            channelList.sync();
        },
    });

    function onPlayerKey(code) {
        var live = !!playing && playing.live;
        var zapStep = code === KEY.CH_UP || code === KEY.UP ? 1 : code === KEY.CH_DOWN || code === KEY.DOWN ? -1 : 0;
        if (channelList.key(code)) return true;
        if (live && code === KEY.LEFT && Player.canOpenChannelList()) {
            channelList.open();
            return true;
        }
        // The player consumes its own keys (overlay, seeking, track menu,
        // resume prompt); Return/Stop and live zapping stay here.
        var handled = Player.key(code, live);
        if (handled === 'back') closePlayer();
        if (handled) return true;
        if (Keys.isBack(code) || code === KEY.STOP) closePlayer(code === KEY.STOP);
        else if (live && (code === KEY.PREVIOUS_CHANNEL || code === KEY.GREEN)) {
            var previous = browser.live.previous();
            if (previous) play(previous);
        } else if (live && zapStep) {
            var next = browser.zap(zapStep);
            if (next) play(next);
        } else return false;
        return true;
    }

    document.addEventListener('keydown', function (event) {
        if (PinPad.isOpen()) {
            PinPad.onKey(event.keyCode);
            event.preventDefault();
            return;
        }
        if (ProfileDialog.isOpen()) return ProfileDialog.onKey(event);
        if (ProfileScreen.isOpen()) return ProfileScreen.onKey(event);
        if (BackupScreen.isOpen()) return BackupScreen.onKey(event);
        if (TmdbSettings.isOpen()) return TmdbSettings.onKey(event);
        if (screen === 'form') return Form.onKey(event);
        var handled = screen === 'player' ? onPlayerKey(event.keyCode) : browser.onKey(event.keyCode);
        if (handled) event.preventDefault();
    });

    ParentalLock.onChange(function () {
        channelList.close();
        var current = browser.live.current();
        if (current && !browser.live.allows(current)) {
            preview.stop();
            if (screen === 'player') closePlayer(true);
        }
    });

    document.addEventListener('sleep-timer-stop', function () {
        closePlayer(true);
        try {
            tizen.application.getCurrentApplication().exit();
        } catch (e) {
            // Browser preview, or firmware that cannot exit: playback is already released.
            browser.toast('Sleep timer stopped playback');
        }
    });

    // Leaving the app (Home, Source) must free the account's connection.
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) preview.stop();
        if (document.hidden && screen === 'player') closePlayer();
        LoadScreen.pause(document.hidden || screen === 'player');
    });

    try {
        if (tizen.tvinputdevice.getKey('Guide')) MEDIA_KEYS.push('Guide');
    } catch (e) {
        // Some remotes do not expose a Guide key.
    }
    try {
        MEDIA_KEYS = MEDIA_KEYS.concat(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
        tizen.tvinputdevice.registerKeyBatch(MEDIA_KEYS);
    } catch (e) {
        // Not on a TV.
    }

    LoadScreen.pause(document.hidden);
    // With two or more profiles, ask who is watching before anything loads.
    if (ProfileScreen.shouldAsk()) ProfileScreen.open(function () { browser.start(); }, exitApp);
    else browser.start();
    Log.info('IPTVnator TV started');
})();
