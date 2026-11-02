(function () {
    'use strict';
    var boot = window.REMOTE;
    var words = boot.words || {};
    var key = '';
    var revision = -1;
    var field = '';
    var typing = false;
    var pendingText = null;
    var sendQueue = Promise.resolve();
    var input = document.getElementById('text');
    function $(id) { return document.getElementById(id); }
    function word(id) { return words[id] || ''; }
    function translate() {
        document.querySelectorAll('[data-t]').forEach(function (node) { node.textContent = word(node.getAttribute('data-t')); });
        document.querySelectorAll('[data-label]').forEach(function (node) { node.setAttribute('aria-label', word(node.dataset.label)); });
        document.title = word('title');
        $('code').placeholder = word('codeLabel');
        $('code').setAttribute('aria-label', word('codeLabel'));
        document.querySelector('.gear').setAttribute('aria-label', word('settings'));
    }
    function call(path, request) {
        return fetch(path, { method: request ? 'POST' : 'GET', headers: { 'Content-Type': 'text/plain', 'Authorization': 'Bearer ' + key }, body: request ? JSON.stringify(request) : undefined }).then(function (response) {
            if (response.status === 404) throw new Error('forgotten');
            if (response.status === 409) throw new Error('limit');
            if (!response.ok) throw new Error('offline');
            return response.json();
        });
    }
    function closed(message) {
        document.body.classList.add('closedstate');
        document.body.classList.toggle('unpaired', message === 'forgotten' || message === 'expired');
        document.body.classList.remove('searching', 'more');
        $('link').classList.add('off');
        $('linkText').textContent = word('waiting');
        document.querySelector('.closed h2').textContent = word(message && message !== 'closedText' ? 'title' : 'closedTitle');
        document.querySelector('.closed p').textContent = word(message || 'closedText');
    }
    function command(request) {
        if (!key) return;
        // Preserve tap order even when the network reorders concurrent requests.
        sendQueue = sendQueue.then(function () { return call('/command', request); }).catch(function (error) { closed(error.message === 'forgotten' ? 'forgotten' : 'closedText'); });
    }
    function keypress(code) { command({ type: 'key', code: code }); }
    function bind(node, request, label) {
        if (label) { node.dataset.label = label; node.setAttribute('aria-label', word(label)); }
        node.addEventListener('click', function () {
            if (request.type === 'jump' && request.action === 'search') {
                pendingText = null;
                input.value = '';
                document.body.classList.add('searching');
                input.focus();
            }
            if (request.type === 'jump') document.body.classList.remove('more');
            command(request);
        });
    }
    function render(next) {
        if (!next || !next.online) return closed();
        words = next.words || words;
        translate();
        document.documentElement.dir = next.dir === 'rtl' ? 'rtl' : 'ltr';
        document.documentElement.lang = next.lang || 'en';
        document.documentElement.dataset.accent = next.accent;
        document.body.classList.remove('closedstate', 'unpaired');
        $('link').classList.remove('off');
        $('linkText').textContent = word('connected');
        document.body.classList.toggle('playing', !!next.seek);
        $('title').textContent = next.title || word('onTV');
        $('sub').textContent = next.subtitle || (next.playing ? [next.elapsed, next.duration].filter(Boolean).join(' / ') || next.kind : word('nothing'));
        document.querySelector('.info').hidden = !next.playing;
        $('art').textContent = next.art || 'Jotv';
        $('art').classList.toggle('live', !next.playing || next.kind === word('live'));
        var context = $('context');
        context.textContent = '';
        (next.actions || []).forEach(function (action, index) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'chip' + (index === 0 && (action.id === 'next' || action.id === 'play' || action.id === 'startover') ? ' primary' : '');
            button.dataset.action = action.id;
            var icons = { next: 'next', skip: 'skip', subtitles: 'cc', audio: 'audio', sync: 'resume', speed: 'ffw', startover: 'restart', lastch: 'back', channels: 'list', play: 'skip', trailer: 'film', favourite: 'heart', wake: 'tvicon' };
            var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
            use.setAttribute('href', '#' + (icons[action.id] || 'info'));
            svg.appendChild(use);
            button.appendChild(svg);
            button.appendChild(document.createTextNode(action.label));
            bind(button, { type: 'context', action: action.id });
            context.appendChild(button);
        });
        document.querySelectorAll('.jump[data-jump]').forEach(function (node) { node.classList.toggle('on', node.dataset.jump === next.jump); });
        var text = next.text;
        document.body.classList.toggle('searching', !!text);
        if (!text) { field = ''; input.blur(); return; }
        input.type = text.type === 'password' ? 'password' : 'text';
        input.setAttribute('aria-label', text.label || word('typing'));
        input.placeholder = text.label || word('typing');
        document.querySelector('.hint').textContent = word('searchHint');
        if (field !== text.id) {
            field = text.id;
            input.value = pendingText !== null ? pendingText : text.value || '';
            if (pendingText !== null) command({ type: 'text', field: field, text: pendingText });
            pendingText = null;
            input.focus();
        } else if (!typing && document.activeElement !== input && text.type !== 'password') input.value = text.value || '';
    }
    function poll() {
        call('/events?since=' + revision).then(function (update) {
            revision = update.revision;
            render(update.state);
            setTimeout(poll, 0);
        }).catch(function (error) {
            closed(error.message === 'forgotten' ? 'forgotten' : 'closedText');
            revision = -1;
            setTimeout(poll, 1500);
        });
    }
    function browserName() {
        var ua = navigator.userAgent;
        var platform = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Linux';
        var browser = /Edg\//.test(ua) ? 'Edge' : /Firefox/.test(ua) ? 'Firefox' : /Chrome/.test(ua) ? 'Chrome' : 'Safari';
        return platform + ' · ' + browser;
    }
    // An iPhone home-screen app has its own storage, apart from Safari's. The
    // key also lives in the address, which is what Add to Home Screen saves.
    function remember() {
        try { localStorage.setItem('jotv-remote-key', key); }
        catch (error) { /* The address still carries the key. */ }
        history.replaceState(null, '', location.pathname + '#k=' + key);
    }
    function redeem(code) {
        call('/pair', { code: code, name: browserName() }).then(function (paired) {
            key = paired.key;
            remember();
            poll();
        }).catch(function (error) { closed(error.message === 'limit' ? 'limit' : 'expired'); });
    }
    function connect() {
        var pair = /^#pair=([A-Za-z0-9]{6})$/.exec(location.hash);
        var saved = /^#k=([0-9a-f]{64})$/.exec(location.hash);
        try { key = localStorage.getItem('jotv-remote-key') || ''; }
        catch (error) { key = ''; }
        if (saved && saved[1] !== key) key = saved[1];
        if (!pair) {
            if (!key) return closed('forgotten');
            remember();
            return poll();
        }
        if (!key) return redeem(pair[1]);
        // Scanning again must not leave an unreachable duplicate pairing behind.
        call('/events?since=-1').then(function (update) {
            remember();
            revision = update.revision;
            render(update.state);
            poll();
        }).catch(function (error) {
            if (error.message === 'forgotten') { key = ''; return redeem(pair[1]); }
            closed();
            setTimeout(connect, 1500);
        });
    }
    var arrows = { up: 38, down: 40, left: 37, right: 39, ok: 13, back: 10009, info: 457 };
    Object.keys(arrows).forEach(function (name) {
        if (name !== 'ok') bind(document.querySelector('.' + name), { type: 'key', code: arrows[name] }, name);
    });
    var ok = document.querySelector('.dpad .ok');
    var held = false;
    ok.addEventListener('pointerdown', function (event) {
        if (event.button !== 0) return;
        event.preventDefault();
        ok.setPointerCapture(event.pointerId);
        held = true;
        command({ type: 'key', code: 13, phase: 'down' });
        if (navigator.vibrate) navigator.vibrate(12);
    });
    function releaseOK() {
        if (!held) return;
        held = false;
        command({ type: 'key', code: 13, phase: 'up' });
    }
    ok.addEventListener('pointerup', releaseOK);
    ok.addEventListener('pointercancel', releaseOK);
    ok.addEventListener('click', function (event) { if (event.detail === 0) keypress(13); });
    bind(document.querySelector('.gear'), { type: 'jump', action: 'settings' }, 'settings');
    var volume = document.querySelectorAll('.volume button');
    [448, 449, 447].forEach(function (code, index) { bind(volume[index], { type: 'key', code: code }, ['quieter', 'mute', 'louder'][index]); });
    document.querySelectorAll('.seekrow button').forEach(function (node, index) { bind(node, { type: 'key', code: index ? 417 : 412 }); });
    var jumps = ['search', 'home', 'live', 'guide', 'movies', 'series', 'favs', 'more'];
    document.querySelectorAll('.jump').forEach(function (node, index) {
        node.dataset.jump = jumps[index];
        if (jumps[index] === 'more') node.addEventListener('click', function () { document.body.classList.add('more'); });
        else bind(node, { type: 'jump', action: jumps[index] });
    });
    document.querySelector('.scrim').addEventListener('click', function () { document.body.classList.remove('more'); });
    document.querySelectorAll('.tile').forEach(function (node, index) { bind(node, { type: 'jump', action: index ? 'lastch' : 'continue' }); });
    document.querySelectorAll('.num').forEach(function (node, index) { bind(node, { type: 'key', code: index < 9 ? 49 + index : index === 9 ? 10190 : index === 10 ? 48 : 13 }); });
    document.querySelectorAll('.color').forEach(function (node, index) { bind(node, { type: 'key', code: 403 + index }, ['red', 'green', 'yellow', 'blue'][index]); });
    function textChanged() {
        if (typing) return;
        if (!field) pendingText = input.value;
        else command({ type: 'text', field: field, text: input.value });
    }
    input.addEventListener('compositionstart', function () { typing = true; });
    input.addEventListener('compositionend', function () { typing = false; textChanged(); });
    input.addEventListener('input', textChanged);
    $('text-done').addEventListener('click', function () { keypress(65376); input.blur(); });
    input.addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); keypress(65376); input.blur(); } });
    // Not paired here: type the code from Jotv's Pair a phone window.
    var codeInput = $('code');
    function typedCode() {
        var code = codeInput.value.trim().toUpperCase();
        if (/^[A-Z0-9]{6}$/.test(code)) { codeInput.blur(); key = ''; redeem(code); }
    }
    $('code-go').addEventListener('click', typedCode);
    codeInput.addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); typedCode(); } });
    // A held button is a remote key, not a copy/paste or link press.
    document.addEventListener('contextmenu', function (event) { if (event.target.tagName !== 'INPUT') event.preventDefault(); });
    document.addEventListener('selectstart', function (event) { if (event.target.tagName !== 'INPUT') event.preventDefault(); });
    var tapTimers = new WeakMap();
    function flashButton(event) {
        var button = event.target.closest('button');
        if (!button || button.disabled) return;
        clearTimeout(tapTimers.get(button));
        button.classList.add('tapped');
        tapTimers.set(button, setTimeout(function () { button.classList.remove('tapped'); }, 140));
    }
    document.addEventListener('pointerdown', flashButton);
    // Safari also needs a touch listener to activate touch press styling.
    document.addEventListener('touchstart', flashButton, { passive: true });
    document.addEventListener('click', function (event) {
        flashButton(event);
        var button = event.target.closest('button');
        if (button && (button !== ok || event.detail === 0) && navigator.vibrate) navigator.vibrate(12);
    });
    translate();
    closed();
    connect();
})();
