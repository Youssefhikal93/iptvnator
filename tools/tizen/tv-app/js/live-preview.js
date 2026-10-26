// Live preview: OK on a channel plays it in a box beside the channel list,
// with its now and next under it; OK on the playing channel goes full screen
// with the same stream. Only the Player's one stream exists (ADR 0006): a new
// channel replaces it, and the box never opens a second one.
//
// hooks: live (LiveChannels), start(request, rect), show(rect) -> whether the
// stream is still playing, fullscreen(request) and stop().
window.LivePreview = function (hooks) {
    'use strict';

    var REFRESH_MS = 30000;
    var content = document.getElementById('content');
    var root = document.getElementById('live-preview');
    var screenBox = document.createElement('div');
    var info = document.createElement('div');
    screenBox.className = 'lp-screen';
    info.className = 'lp-info';
    root.appendChild(screenBox);
    root.appendChild(info);
    var s = { shown: false, channel: null, request: null, programmes: null, session: 0, timer: null };

    function el(tag, cls, text) {
        var node = document.createElement(tag);
        node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function clock(ms) {
        return I18n.time(ms);
    }

    function enabled() {
        // The box needs the list view: a grid has no room beside it.
        return Prefs.get('livePreview') !== false && Library.view('live', 'list') === 'list';
    }

    function same(a, b) {
        return !!a && !!b && Library.keyOf('live', a) === Library.keyOf('live', b);
    }

    function rect() {
        var at = screenBox.getBoundingClientRect();
        return { x: Math.round(at.left), y: Math.round(at.top), w: Math.round(at.width), h: Math.round(at.height) };
    }

    function programmeRow(tag, programme) {
        var line = el('div', 'lp-row');
        line.appendChild(el('span', 'lp-tag', tag));
        line.appendChild(el('span', 'lp-time', clock(programme.start) + ' – ' + clock(programme.end)));
        line.appendChild(el('span', 'lp-programme', programme.title));
        return line;
    }

    function renderInfo() {
        info.textContent = '';
        info.appendChild(el('div', 'lp-title', s.request ? s.request.title : ''));
        var p = s.programmes;
        if (!p || !p.now) return;
        info.appendChild(programmeRow(I18n.t('epg.now'), p.now));
        var bar = el('div', 'lp-bar');
        var fill = el('div', 'lp-fill');
        fill.style.width = Math.round(Math.min(1, Math.max(0, (Date.now() - p.now.start) / (p.now.end - p.now.start))) * 100) + '%';
        bar.appendChild(fill);
        info.appendChild(bar);
        if (p.next) info.appendChild(programmeRow(I18n.t('epg.next'), p.next));
    }

    function loadInfo() {
        var mine = ++s.session;
        s.programmes = null;
        renderInfo();
        var request = s.request;
        if (!request || !request.programmes || !Prefs.get('programmeGuide')) return;
        request.programmes().then(function (programmes) {
            if (mine !== s.session) return;
            s.programmes = programmes;
            renderInfo();
        }).catch(function () {
            Log.error('PREVIEW EPG FAIL');
        });
    }

    // Keeps the progress bar moving and picks up the next programme.
    function refresh() {
        var now = s.programmes && s.programmes.now;
        if (now && Date.now() >= now.end) loadInfo();
        else renderInfo();
    }

    function reveal() {
        s.shown = true;
        content.classList.add('previewing');
        clearInterval(s.timer);
        s.timer = setInterval(refresh, REFRESH_MS);
    }

    function hide() {
        s.shown = false;
        s.session++;
        s.channel = s.request = s.programmes = null;
        clearInterval(s.timer);
        content.classList.remove('previewing');
        info.textContent = '';
    }

    function stop() {
        if (!s.shown) return;
        hide();
        hooks.stop();
    }

    return {
        stop: stop,
        active: function () {
            return s.shown;
        },
        // Returns false when the viewer's setting (or the grid view) asks for
        // plain full-screen playback and the caller should open the channel.
        open: function (item, list) {
            if (!enabled()) return false;
            if (s.shown && same(item, s.channel)) {
                hooks.fullscreen(s.request);
                return true;
            }
            var request = hooks.live.play(item, list);
            if (!request) return true;
            s.channel = item;
            s.request = request;
            reveal();
            loadInfo();
            hooks.start(request, rect());
            return true;
        },
        // Return from full screen: show the playing channel in the box again.
        // False when the full screen was not opened from a preview, or the
        // stream is no longer playing.
        back: function (request) {
            if (!s.shown) return false;
            var channel = hooks.live.current();
            if (!request || !request.live || !channel) {
                stop();
                return false;
            }
            reveal();
            if (!hooks.show(rect())) {
                stop();
                return false;
            }
            s.channel = channel;
            s.request = request;
            loadInfo();
            return true;
        },
    };
};
