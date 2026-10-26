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
    // True when editing the whole source, not only its guide link.
    var whole = false;

    function fields() {
        var inputs = type === 'xtream' ? ['form-name', 'form-url', 'form-user', 'form-pass'] : ['form-name', 'form-url'];
        if (editing && !whole) inputs = [];
        inputs = inputs.concat(['form-epg-url', 'form-epg-offset']);
        if (type === 'xtream') inputs.push('form-epg-prefer');
        return inputs.concat(['form-save', 'form-cancel']);
    }

    function message(text) {
        $('form-msg').textContent = text;
    }

    function open(kind, done, mode) {
        editing = typeof kind === 'object' ? kind : null;
        whole = !!editing && mode === 'source';
        kind = editing ? editing.type : kind;
        var xtream = kind === 'xtream';
        type = kind;
        onDone = done;
        ['form-name', 'form-url', 'form-user', 'form-pass'].forEach(function (id) {
            $(id).value = '';
        });
        $('form-title').textContent = I18n.t(xtream ? 'form.addXtream' : 'form.addM3u');
        $('form-url-label').textContent = I18n.t(xtream ? 'form.serverUrl' : 'form.playlistLink');
        $('form-url').placeholder = xtream ? 'http://example.com:8080' : 'https://example.com/playlist.m3u';
        $('form-login').classList.toggle('hidden', !xtream);
        $('form-source').classList.toggle('hidden', !!editing && !whole);
        $('form-epg-preference').classList.toggle('hidden', !xtream);
        $('form-epg-url').value = editing && editing.epgUrl || '';
        $('form-epg-offset').value = editing && editing.epgOffset || 0;
        $('form-epg-prefer').value = editing && editing.epgPrefer === false ? 'no' : 'yes';
        if (editing) $('form-title').textContent = I18n.t(whole ? 'form.editSource' : 'form.guideTitle');
        if (whole) {
            $('form-name').value = editing.name || '';
            $('form-url').value = editing.url || '';
            $('form-user').value = editing.user || '';
            $('form-pass').value = editing.pass || '';
        }
        message('');
        $('form').classList.remove('hidden');
        $(editing && !whole ? 'form-epg-url' : whole ? 'form-name' : 'form-url').focus();
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
        if (guideUrl && !/^https?:\/\//i.test(guideUrl)) return message(I18n.t('form.guideLinkScheme'));
        if (!isFinite(offset) || offset < -12 || offset > 12) return message(I18n.t('form.offsetRange'));
        var source = { type: type, name: $('form-name').value, url: $('form-url').value.trim() };
        if (editing) source = Object.assign({}, editing);
        var before = editing || {};
        source.epgUrl = guideUrl;
        source.epgOffset = offset;
        source.epgPrefer = $('form-epg-prefer').value !== 'no';
        if (editing && !whole) return close(source);
        if (whole) {
            source.name = $('form-name').value.trim();
            source.url = $('form-url').value.trim();
        }
        if (type === 'xtream') {
            source.user = $('form-user').value.trim();
            source.pass = $('form-pass').value.trim();
        }
        if (!/^https?:\/\//i.test(source.url)) return message(I18n.t('form.linkScheme'));
        if (type === 'xtream' && (!source.user || !source.pass)) return message(I18n.t('form.needLogin'));
        // Only a new login or server needs the provider's answer.
        if (whole && source.url === before.url && source.user === before.user && source.pass === before.pass) return close(source);
        message(I18n.t('tmdb.checking'));
        var adapter = type === 'xtream' ? XtreamSource(source) : M3uSource(source);
        adapter
            .account()
            .then(function () {
                close(source);
            })
            .catch(function (err) {
                // A lapsed account still has a valid login; the account screen explains it.
                if (whole && err.code === 'account' && err.reason !== 'login') return close(source);
                Log.error('ADD SOURCE FAIL ' + err.message);
                message(I18n.t('form.connectFailed', { reason: err.message }));
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
