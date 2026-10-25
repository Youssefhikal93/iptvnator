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
    var MEDIA_KEYS = ['ChannelUp', 'ChannelDown', 'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind'];

    var screen = 'browser';

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
        Player.play(request);
    }

    function closePlayer() {
        Player.stop();
        screen = 'browser';
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
        var live = browser.isLive();
        var zapStep = { 427: 1, 38: 1, 428: -1, 40: -1 }[code];
        if (code === KEY.RETURN || code === KEY.BACKSPACE || code === KEY.ESCAPE || code === KEY.STOP) closePlayer();
        else if (live && zapStep) {
            var next = browser.zap(zapStep);
            if (next) Player.play(next);
        } else if (live && code === KEY.ENTER) Player.info();
        else if (!live && [KEY.ENTER, KEY.PLAY_PAUSE, KEY.PLAY, KEY.PAUSE].indexOf(code) !== -1) Player.togglePause();
        else if (!live && (code === KEY.RIGHT || code === KEY.FAST_FORWARD)) Player.seek(true);
        else if (!live && (code === KEY.LEFT || code === KEY.REWIND)) Player.seek(false);
        else return false;
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
