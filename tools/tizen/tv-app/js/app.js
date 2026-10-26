// Startup and key routing between the browser, the add-source form and the
// full-screen player.
(function () {
    'use strict';

    var KEY = {
        LEFT: 37,
        UP: 38,
        RIGHT: 39,
        DOWN: 40,
        ENTER: 13,
        RETURN: 10009,
        BACKSPACE: 8,
        ESCAPE: 27,
        CH_UP: 427,
        CH_DOWN: 428,
        PLAY_PAUSE: 10252,
        PLAY: 415,
        PAUSE: 19,
        STOP: 413,
        FAST_FORWARD: 417,
        REWIND: 412,
    };
    var MEDIA_KEYS = ['ChannelUp', 'ChannelDown', 'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'ColorF2Yellow', 'Info'];

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
        screen = 'player';
        playing = request;
        Player.play(request);
    }

    function closePlayer() {
        Player.stop();
        playing = null;
        screen = 'browser';
        browser.afterPlayback();
    }

    var browser = Browser({
        play: play,
        exit: exitApp,
        openForm: function (kind, done) {
            screen = 'form';
            Form.open(kind, function (source) {
                screen = 'browser';
                done(source);
            });
        },
    });

    function onPlayerKey(code) {
        var live = !!playing && playing.live;
        var zapStep = { 427: 1, 38: 1, 428: -1, 40: -1 }[code];
        // The player consumes its own keys (overlay, seeking, track menu,
        // resume prompt); Return/Stop and live zapping stay here.
        if (Player.key(code, live)) return true;
        if (code === KEY.RETURN || code === KEY.BACKSPACE || code === KEY.ESCAPE || code === KEY.STOP) closePlayer();
        else if (live && zapStep) {
            var next = browser.zap(zapStep);
            if (next) play(next);
        } else return false;
        return true;
    }

    document.addEventListener('keydown', function (event) {
        if (screen === 'form') return Form.onKey(event);
        var handled = screen === 'player' ? onPlayerKey(event.keyCode) : browser.onKey(event.keyCode);
        if (handled) event.preventDefault();
    });

    // Leaving the app (Home, Source) must free the account's connection.
    document.addEventListener('visibilitychange', function () {
        if (document.hidden && screen === 'player') closePlayer();
    });

    try {
        tizen.tvinputdevice.registerKeyBatch(MEDIA_KEYS);
    } catch (e) {
        // Not on a TV.
    }

    browser.start();
    Log.info('IPTVnator TV started');
})();
