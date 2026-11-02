// The app's remote bridge reuses keys and action closures owned by the TV.
window.RemoteApp = function (api) {
    'use strict';
    function overlayTitle() {
        var title = document.querySelector('#remote-pair h1, #profile-dialog h1, #profiles h1, #backup-screen h1, #tmdb-key-entry h1, #opensubs-key-entry h1, #pin-pad:not(.hidden) h1, #form:not(.hidden) #form-title');
        return title ? title.textContent : '';
    }
    function actions(player, browser) {
        if (api.saver().isOn()) return [{ id: 'wake', label: I18n.t('remote.wake'), run: api.saver().wake }];
        if (overlayTitle()) return [];
        browser = browser || api.browser.remote();
        if (api.screen() !== 'player') return browser.detail ? browser.detail.actions : [];
        player = player || Player.remote();
        if (!player) return [];
        if (player.kind === 'live') {
            if (api.browser.live.previousChannel()) player.offered.lastch = { label: I18n.t('remote.lastch'), run: api.previous };
            if (Player.canOpenChannelList()) player.offered.channels = { label: I18n.t('remote.channels'), run: api.channels };
        }
        return RemoteContext.select(player.kind, player.offered);
    }
    function state() {
        var browser = api.browser.remote();
        var overlay = overlayTitle();
        var saver = api.saver().isOn();
        var playing = !overlay && !saver && api.screen() === 'player' && Player.remote();
        var title = saver ? I18n.t('settings.screenSaver') : overlay || (browser.detail ? browser.detail.title : I18n.t('rail.' + browser.section));
        var next = playing || { title: title, playing: false, seek: false };
        next.actions = actions(playing, browser).map(function (action) { return { id: action.id, label: action.label }; });
        delete next.offered;
        next.jump = browser.jump;
        if (playing) next.kind = I18n.t('remote.' + playing.kind);
        return next;
    }
    var nativeButton = null;
    function dispatch(code, phase) {
        var target = document.activeElement || document;
        if (phase === 'up') {
            target.dispatchEvent(new KeyboardEvent('keyup', { keyCode: code, which: code, bubbles: true, cancelable: true }));
            if (nativeButton && nativeButton === target && document.contains(target)) target.click();
            nativeButton = null;
            return;
        }
        var event = new KeyboardEvent('keydown', { keyCode: code, which: code, bubbles: true, cancelable: true });
        var nativeAction = target.dispatchEvent(event);
        if (phase === 'down') { nativeButton = nativeAction && target.tagName === 'BUTTON' ? target : null; return; }
        target.dispatchEvent(new KeyboardEvent('keyup', { keyCode: code, which: code, bubbles: true, cancelable: true }));
        // Synthetic keyboard events have no browser default activation.
        if (nativeAction && code === Keys.ENTER && target.tagName === 'BUTTON') target.click();
    }
    function volume(code) {
        try {
            if (typeof tizen === 'undefined' || !tizen.tvaudiocontrol) return;
            if (code === 449) tizen.tvaudiocontrol.setMute(!tizen.tvaudiocontrol.isMute());
            else if (code === 447) tizen.tvaudiocontrol.setVolumeUp();
            else tizen.tvaudiocontrol.setVolumeDown();
            VolumeOsd.show(tizen.tvaudiocontrol.getVolume(), tizen.tvaudiocontrol.isMute());
        } catch (error) { Log.info('REMOTE volume unavailable'); }
    }
    function command(request) {
        if (document.hidden) return;
        if (request.type === 'key') {
            dispatch(request.code, request.phase);
            if ([447, 448, 449].indexOf(request.code) >= 0) volume(request.code);
            return;
        }
        if (request.type === 'context') {
            var action = actions().filter(function (entry) { return entry.id === request.action; })[0];
            if (action) action.run();
            return;
        }
        if (request.type !== 'jump' || ProfileScreen.isOpen() || PinPad.isOpen() || ProfileDialog.isOpen() || api.screen() === 'form') return;
        if (api.saver().isOn()) api.saver().wake();
        if (request.action === 'lastch') return api.screen() === 'player' && Player.request() && Player.request().live ? api.previous() : api.browser.remoteLast();
        var browser = api.browser.remote();
        var section = RemoteContext.section(browser, api.screen() === 'player' ? Player.request() : null);
        if (api.screen() === 'player') api.closePlayer(true);
        var scoped = request.action === 'search' || request.action === 'favs';
        var ready = scoped && section !== browser.section ? api.browser.remoteJump(section) : null;
        Promise.resolve(ready).then(function () { return api.browser.remoteJump(request.action); }).catch(function () { Log.info('REMOTE jump unavailable'); });
    }
    return { state: state, command: command };
};
