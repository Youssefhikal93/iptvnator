// "Add source" form for an Xtream account or an M3U link. The source is
// checked (login or playlist download) before it is saved.
window.Form = (function () {
    'use strict';

    var KEY = Keys;
    var $ = function (id) {
        return document.getElementById(id);
    };
    var type = 'xtream';
    var onDone = null;
    var editing = null;

    function fields() {
        var inputs = type === 'xtream' ? ['form-name', 'form-url', 'form-user', 'form-pass'] : ['form-name', 'form-url'];
        if (editing) inputs = [];
        inputs = inputs.concat(['form-epg-url', 'form-epg-offset']);
        if (type === 'xtream') inputs.push('form-epg-prefer');
        return inputs.concat(['form-save', 'form-cancel']);
    }

    function message(text) {
        $('form-msg').textContent = text;
    }

    function open(kind, done) {
        editing = typeof kind === 'object' ? kind : null;
        kind = editing ? editing.type : kind;
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
        $('form-source').classList.toggle('hidden', !!editing);
        $('form-epg-preference').classList.toggle('hidden', !xtream);
        $('form-epg-url').value = editing && editing.epgUrl || '';
        $('form-epg-offset').value = editing && editing.epgOffset || 0;
        $('form-epg-prefer').value = editing && editing.epgPrefer === false ? 'no' : 'yes';
        if (editing) $('form-title').textContent = 'Guide link';
        message('');
        $('form').classList.remove('hidden');
        $(editing ? 'form-epg-url' : 'form-url').focus();
    }

    function close(source) {
        $('form').classList.add('hidden');
        var done = onDone;
        onDone = null;
        if (done) done(source);
    }

    function save() {
        var guideUrl = $('form-epg-url').value.trim();
        var offset = Number($('form-epg-offset').value);
        if (guideUrl && !/^https?:\/\//i.test(guideUrl)) return message('The guide link must start with http:// or https://');
        if (!isFinite(offset) || offset < -12 || offset > 12) return message('The guide time offset must be from -12 to +12.');
        var source = { type: type, name: $('form-name').value, url: $('form-url').value.trim() };
        if (editing) source = Object.assign({}, editing);
        source.epgUrl = guideUrl;
        source.epgOffset = offset;
        source.epgPrefer = $('form-epg-prefer').value !== 'no';
        if (editing) return close(source);
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
        if ((code === KEY.LEFT || code === KEY.RIGHT) && document.activeElement.id === 'form-epg-offset') {
            $('form-epg-offset').value = Math.max(-12, Math.min(12, (Number($('form-epg-offset').value) || 0) + (code === KEY.LEFT ? -1 : 1)));
            return event.preventDefault();
        }
        if ((code === KEY.LEFT || code === KEY.RIGHT) && document.activeElement.id === 'form-epg-prefer') {
            $('form-epg-prefer').value = code === KEY.LEFT ? 'no' : 'yes';
            return event.preventDefault();
        }
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
