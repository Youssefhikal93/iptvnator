// Startup and key routing between the browser, the add-source form and the
// full-screen player.
(function () {
    'use strict';

    var KEY = Keys;
    var MEDIA_KEYS = ['ChannelUp', 'ChannelDown', 'PreviousChannel', 'ColorF1Green', 'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'ColorF2Yellow', 'ColorF3Blue', 'Info'];

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

    // Return on the menu, the loading screen or "Who's watching?" would close
    // the app: it asks first, with Cancel focused. The sleep timer still exits
    // at once.
    // stay runs on Cancel or Return, where the screen asking was closed first.
    function askExit(stay) {
        var back = typeof stay === 'function' ? stay : null;
        Menu.open(I18n.t('app.exitTitle'), [
            { label: I18n.t('app.exit'), run: exitApp },
            { label: I18n.t('common.cancel'), run: back },
        ], 1, null, back);
    }

    function whoIsWatching() {
        ProfileScreen.open(function () { browser.start(); }, function () { askExit(whoIsWatching); });
    }

    function play(request) {
        if (!request) return;
        if (multiView) multiView.stop();
        screen = 'player';
        playing = request;
        Player.play(request, null);
        LoadScreen.pause(true);
        channelList.sync();
    }

    // A channel change from the player shows the channel banner (#79).
    function zap(request) {
        if (request) request.zapped = true;
        play(request);
    }

    // Return from full screen opened on a live preview goes back to the box,
    // with the stream still playing; STOP closes everything.
    function closePlayer(stopped) {
        if (multiView) multiView.stop();
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
        exit: function () { askExit(); },
        preview: {
            open: function (item, list, category) {
                return preview.open(item, list, category);
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
    var multiView = null;
    var channelList = ChannelList({
        channels: browser.live, epg: browser.epg, visibility: Player.channelList,
        play: zap,
        unlock: function (category, done) {
            if (!multiView.active() || !ParentalLock.isLocked(Sources.current().id, 'live', category.category_id) || ParentalLock.isUnlocked()) return false;
            PinPad.open('unlock', done);
            return true;
        },
    });
    multiView = MultiView({
        current: browser.live.capture,
        request: browser.live.request,
        catalogue: browser.live.catalogue,
        allows: browser.live.allows,
        focus: browser.live.focus,
        pick: function (done) { channelList.open(function (request, selection) { done(selection); }); },
        fullscreen: function (selection) { play(browser.live.play(selection.channel, selection.channels, selection.category)); },
        close: function () { closePlayer(true); },
        zap: function (delta) { return browser.live.zap(delta) ? browser.live.capture() : null; },
    });
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

    // A reminder (#75) shows over any screen except where it would cover a
    // PIN pad or the choice of profile.
    var reminderPopup = ReminderPopup({
        allowed: function () { return !PinPad.isOpen() && !ProfileScreen.isOpen() && !ProfileDialog.isOpen() && screen !== 'form'; },
        watch: function (reminder) { browser.watchReminder(reminder); },
        // A reminder due while the screen saver shows ends it, so the viewer sees it.
        shown: function () { if (saver) saver.wake(); },
    });
    var saver = null;

    // PRE-CH, Green and the menu's Previous channel row (#89).
    function watchPrevious() {
        var previous = browser.live.previous();
        if (previous) zap(previous);
    }
    PlayerHelp.init({
        previous: function () { return browser.live.previousChannel(); }, watchPrevious: watchPrevious,
        openMultiView: multiView.open,
        resumeMultiView: multiView.resume,
        canResumeMultiView: function () { return !!MultiViewStore.read(Sources.current().id); },
    });

    // Hold OK on live TV opens the player menu (#89), a tap does what OK did.
    function onPlayerKey(code) {
        if (Keys.repeat(code)) return true;
        if (multiView.active()) {
            if (channelList.key(code)) return true;
            return multiView.key(code);
        }
        if (code !== KEY.ENTER || !Player.canHoldMenu()) return playerKey(code);
        Keys.press(function () { playerKey(code); }, Player.openMenu, document.getElementById('player'));
        return true;
    }

    function playerKey(code) {
        var live = !!playing && playing.live;
        var zapStep = code === KEY.CH_UP || code === KEY.UP ? 1 : code === KEY.CH_DOWN || code === KEY.DOWN ? -1 : 0;
        if (channelList.key(code)) return true;
        if (live && !playing.catchUp && code === KEY.BLUE && Player.canOpenChannelList()) {
            multiView.open();
            return true;
        }
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
        else if (live && (code === KEY.PREVIOUS_CHANNEL || code === KEY.GREEN)) watchPrevious();
        else if (live && zapStep) {
            var next = browser.zap(zapStep);
            if (next) zap(next);
        } else return false;
        return true;
    }

    // Where the remote is, for the key timing log.
    function browserScreen() {
        var content = document.getElementById('content');
        if (document.querySelector('#rail .focused')) return 'menu';
        return content.classList.contains('home') ? 'home' : content.classList.contains('settings') ? 'settings' : 'lists';
    }

    document.addEventListener('keydown', function (event) {
        if (RemoteSettings.isOpen()) return RemoteSettings.onKey(event);
        if (PinPad.isOpen()) {
            PinPad.onKey(event.keyCode);
            event.preventDefault();
            return;
        }
        if (reminderPopup.isOpen()) {
            reminderPopup.onKey(event.keyCode);
            event.preventDefault();
            return;
        }
        if (ProfileDialog.isOpen()) return ProfileDialog.onKey(event);
        if (KidsPicker.isOpen()) return KidsPicker.onKey(event);
        if (AvatarPicker.isOpen()) return AvatarPicker.onKey(event);
        if (ProfileScreen.isOpen()) return ProfileScreen.onKey(event);
        if (BackupScreen.isOpen()) return BackupScreen.onKey(event);
        if (TmdbSettings.isOpen()) return TmdbSettings.onKey(event);
        if (OpenSubsSettings.isOpen()) return OpenSubsSettings.onKey(event);
        if (screen === 'form') return Form.onKey(event);
        var handled = screen === 'player' ? onPlayerKey(event.keyCode)
            : KeyTiming.measure(browserScreen(), function () { return browser.onKey(event.keyCode); });
        if (handled) event.preventDefault();
    });

    ParentalLock.onChange(function () {
        if (multiView.active()) {
            if (!ParentalLock.isUnlocked()) channelList.close();
            return multiView.enforceLocks();
        }
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
            browser.toast(I18n.t('sleep.stoppedToast'));
        }
    });
    document.addEventListener('player-sleep-warning', function () {
        multiView.closeMenu();
        if (!multiView.active()) return;
        Menu.close();
        channelList.close();
    });

    document.addEventListener('trailer-open', function () {
        if (preview.active()) preview.stop();
        else Player.stop();
    });
    document.addEventListener('trailer-unavailable', function () {
        browser.toast(I18n.t('trailer.unavailable'));
    });

    document.addEventListener('subtitle-toast', function (event) {
        browser.toast(event.detail, 8000);
    });

    // The Samsung home screen's Jotv tiles (#91); Off leaves none there.
    function publishTiles() {
        var text = Prefs.get('homeTiles') ? browser.homeTiles() : JSON.stringify({ sections: [] });
        if (text) HubTiles.publish(text);
    }

    // Leaving the app (Home, Source) must free the account's connection.
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) preview.stop();
        if (document.hidden && screen === 'player') closePlayer();
        LoadScreen.pause(document.hidden || screen === 'player');
        // After the player closed, so Continue watching has where it stopped.
        if (document.hidden) publishTiles();
    });
    Prefs.onChange(function (name) {
        if (name === 'homeTiles') publishTiles();
    });
    HubTiles.listen(function (picked) {
        if (screen === 'player') closePlayer(true);
        browser.openTile(picked);
    });
    // A first set of tiles once the library has loaded.
    setTimeout(publishTiles, 30000);

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
    // Menus, a paused video and the live preview count as idle; a playing
    // full-screen video never does.
    saver = ScreenSaver({
        allowed: function () { return !reminderPopup.isOpen() && !multiView.active() && (screen !== 'player' || Player.paused()); },
        slides: browser.saverSlides,
    });

    AutoRefresh.start({
        busy: function () { return screen === 'player' || preview.active(); },
        published: browser.catalogueRefreshed,
    });

    if (ProfileScreen.shouldAsk()) whoIsWatching();
    else browser.start();
    PhoneRemote.start(RemoteApp({ browser: browser, screen: function () { return screen; }, saver: function () { return saver; }, previous: watchPrevious, channels: channelList.open, closePlayer: closePlayer }));
    Log.info('Jotv started');
})();
