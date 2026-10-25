// "Add source" form for an Xtream account or an M3U link. The source is
// checked (login or playlist download) before it is saved.
window.Form = (function () {
    'use strict';

    var KEY = { UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39, RETURN: 10009, ESCAPE: 27 };
    var $ = function (id) {
        return document.getElementById(id);
    };
    var type = 'xtream';
    var onDone = null;

    function fields() {
        var inputs = type === 'xtream' ? ['form-name', 'form-url', 'form-user', 'form-pass'] : ['form-name', 'form-url'];
        return inputs.concat(['form-save', 'form-cancel']);
    }

    function message(text) {
        $('form-msg').textContent = text;
    }

    function open(kind, done) {
        var xtream = kind === 'xtream';
        type = kind;
        onDone = done;
        ['form-name', 'form-url', 'form-user', 'form-pass'].forEach(function (id) {
            $(id).value = '';
        });
        $('form-title').textContent = xtream ? 'Add Xtream account' : 'Add M3U playlist';
        $('form-url-label').textContent = xtream ? 'Server URL' : 'Playlist link';
        $('form-url').placeholder = xtream ? 'http://example.com:8080' : 'https://example.com/playlist.m3u';
        $('form-login').classList.toggle('hidden', !xtream);
        message('');
        $('form').classList.remove('hidden');
        $('form-url').focus();
    }

    function close(source) {
        $('form').classList.add('hidden');
        var done = onDone;
        onDone = null;
        if (done) done(source);
    }

    function save() {
        var source = { type: type, name: $('form-name').value, url: $('form-url').value.trim() };
        if (type === 'xtream') {
            source.user = $('form-user').value.trim();
            source.pass = $('form-pass').value.trim();
        }
        if (!/^https?:\/\//i.test(source.url)) return message('The link must start with http:// or https://');
        if (type === 'xtream' && (!source.user || !source.pass)) return message('Enter the username and password.');
        message('Checking…');
        var adapter = type === 'xtream' ? XtreamSource(source) : M3uSource(source);
        adapter
            .account()
            .then(function () {
                close(source);
            })
            .catch(function (err) {
                Log.error('ADD SOURCE FAIL ' + err.message);
                message('Could not connect: ' + err.message);
            });
    }

    // OK on a button is a native click; this handles moving between fields.
    function onKey(event) {
        var list = fields();
        var index = list.indexOf(document.activeElement && document.activeElement.id);
        var code = event.keyCode;
        var onButtons = index >= list.length - 2;
        var step = { 38: -1, 40: 1 }[code] || (onButtons ? { 37: -1, 39: 1 }[code] : 0);
        if (step) {
            $(list[Math.max(0, Math.min(list.length - 1, index + step))]).focus();
            event.preventDefault();
        } else if (code === KEY.RETURN || code === KEY.ESCAPE) {
            close(null);
            event.preventDefault();
        }
    }

    $('form-save').addEventListener('click', save);
    $('form-cancel').addEventListener('click', function () {
        close(null);
    });

    return {
        open: open,
        onKey: onKey,
        isOpen: function () {
            return onDone !== null;
        },
    };
})();
