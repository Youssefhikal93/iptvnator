window.PhoneRemote = (function () {
    'use strict';
    var BASE = 'http://127.0.0.1:8778';
    var hooks = null;
    var revision = -1;
    var timer = null;
    var updateTimer = null;
    var last = '';
    var active = false;
    var serial = 0;
    var pageId = Date.now().toString(36);
    var focused = null;
    function launch() {
        try {
            if (typeof tizen !== 'undefined' && tizen.ApplicationControl) tizen.application.launchAppControl(new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default'), 'IPTVnTVApp.PhoneRemote', function () {}, function () {});
        } catch (error) { /* The loopback request below will retry. */ }
    }
    function call(path, request) {
        return fetch(BASE + path, request ? { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(request) } : {}).then(function (response) {
            if (!response.ok) throw new Error('Remote unavailable');
            return response.json();
        });
    }
    function textField() {
        var node = document.activeElement;
        var editable = node && (node.tagName === 'TEXTAREA' || (node.tagName === 'INPUT' && ['text', 'search', 'password', 'email', 'url', 'tel', 'number'].indexOf(node.type) >= 0));
        if (!editable) { focused = null; return null; }
        if (focused !== node) { focused = node; serial++; }
        return { id: pageId + ':' + serial, type: node.type, value: node.type === 'password' ? '' : node.value, label: node.getAttribute('aria-label') || node.placeholder || '' };
    }
    function words() {
        var table = {};
        Object.keys(I18n.tables.en).filter(function (key) { return key.indexOf('remote.') === 0; }).forEach(function (key) { table[key.slice(7)] = I18n.t(key); });
        return table;
    }
    function snapshot() {
        var next = hooks.state();
        next.online = active && !document.hidden;
        next.words = words();
        next.lang = I18n.language();
        next.dir = next.lang === 'ar' ? 'rtl' : 'ltr';
        next.accent = document.documentElement.getAttribute('data-accent') || 'blue';
        next.text = textField();
        return next;
    }
    function publish(force) {
        if (!hooks || !active) return Promise.resolve();
        var next = snapshot();
        var encoded = JSON.stringify(next);
        if (!force && encoded === last) return Promise.resolve();
        return call('/app/state', next).then(function () { last = encoded; });
    }
    function changed() {
        if (updateTimer) return;
        updateTimer = setTimeout(function () { updateTimer = null; publish(false).catch(function () {}); }, 25);
    }
    function deliver(entry) {
        if (document.hidden) return;
        var command = entry.command;
        if (command.type === 'text') {
            var field = textField();
            if (!field || field.id !== command.field) return;
            focused.value = command.text.slice(0, focused.maxLength > 0 ? focused.maxLength : 8192);
            focused.dispatchEvent(new Event('input', { bubbles: true }));
        } else hooks.command(command);
        changed();
    }
    function poll() {
        if (!active) return;
        call('/app/events?since=' + revision).then(function (answer) {
            if (!active) return;
            revision = answer.revision;
            RemoteSettings.update(answer.phones);
            answer.commands.forEach(deliver);
            timer = setTimeout(poll, 0);
        }).catch(function () {
            last = '';
            revision = -1;
            if (active) { launch(); timer = setTimeout(poll, 1500); publish(true).catch(function () {}); }
        });
    }
    function connect() {
        if (active || !hooks) return;
        active = true;
        launch();
        publish(true).catch(function () {});
        poll();
        setInterval(function () { publish(true).catch(function () {}); }, 5000);
        setInterval(function () { publish(false).catch(function () {}); }, 1000);
        new MutationObserver(changed).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
        new MutationObserver(changed).observe(document.documentElement, { attributes: true });
        document.addEventListener('focusout', function () { focused = null; });
        ['focusin', 'focusout', 'input', 'keyup', 'visibilitychange'].forEach(function (name) { document.addEventListener(name, changed); });
        window.addEventListener('pagehide', function () {
            active = false;
            clearTimeout(timer);
            fetch(BASE + '/app/state', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ online: false, words: words() }), keepalive: true }).catch(function () {});
        });
    }
    function start(api) {
        hooks = api;
        var canLaunch = typeof tizen !== 'undefined' && tizen.application && typeof tizen.application.launchAppControl === 'function' && typeof tizen.ApplicationControl === 'function';
        if (canLaunch) return connect();
        // Browser previews have no Tizen service. Probe once; Settings can
        // explicitly connect later, and local service tests discover it here.
        call('/app/phones').then(function (phones) { RemoteSettings.update(phones); connect(); }).catch(function () {});
    }
    return { start: start, connect: connect, call: call, changed: changed };
})();
