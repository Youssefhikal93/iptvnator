// Now and Next on the live player overlay: titles, times, the current
// programme's progress and description. A live request opts in with
// `programmes()` -> Promise<{ now, next }> (built by the browser).
window.PlayerEpg = function () {
    'use strict';

    var box = document.getElementById('pl-epg');
    var s = { req: null, session: 0, shown: null, reloading: false, parts: null };

    function el(tag, cls, text) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function clock(ms) {
        return I18n.time(ms);
    }

    function row(tag, programme) {
        var line = el('div', 'pl-epg-row');
        line.appendChild(el('span', 'pl-epg-tag', tag));
        line.appendChild(el('span', 'pl-epg-time', clock(programme.start) + ' – ' + clock(programme.end)));
        line.appendChild(el('span', 'pl-epg-title', programme.title));
        return line;
    }

    function build() {
        var p = s.shown;
        box.textContent = '';
        s.parts = null;
        if (!p || !p.now) return box.classList.add('hidden');
        var now = row(I18n.t('epg.now'), p.now);
        var left = el('span', 'pl-epg-left');
        now.appendChild(left);
        box.appendChild(now);
        var bar = el('div', 'pl-epg-bar');
        var fill = el('div', 'pl-epg-fill');
        bar.appendChild(fill);
        box.appendChild(bar);
        if (p.now.desc) box.appendChild(el('div', 'pl-epg-desc', p.now.desc));
        if (p.next) box.appendChild(row(I18n.t('epg.next'), p.next));
        if (s.req.watchFromStart) box.appendChild(el('div', 'pl-epg-catch-up', I18n.t('epg.watchFromStart')));
        s.parts = { left: left, fill: fill };
        box.classList.remove('hidden');
    }

    function fetchFor(req) {
        if (!Prefs.get('programmeGuide')) return;
        var mine = s.session;
        return req.programmes().then(function (programmes) {
            if (mine !== s.session || !Prefs.get('programmeGuide')) return;
            s.shown = programmes;
            s.reloading = false;
            build();
        });
    }

    function reset() {
        s.session++;
        s.req = null;
        s.shown = null;
        s.reloading = false;
        build();
    }

    return {
        watchFromStart: function () {
            var programme = s.shown && s.shown.now;
            return s.req && s.req.watchFromStart && programme ? function () { s.req.watchFromStart(programme); } : null;
        },
        reset: reset,
        load: function (req) {
            reset();
            if (!Prefs.get('programmeGuide') || !req.live || !req.programmes) return;
            s.req = req;
            fetchFor(req);
        },
        // Called on every player render while live.
        render: function () {
            if (!Prefs.get('programmeGuide')) return reset();
            var now = s.shown && s.shown.now;
            if (!now || !s.parts) return;
            var t = Date.now();
            if (t >= now.end && !s.reloading) {
                s.reloading = true;
                fetchFor(s.req);
                return;
            }
            s.parts.fill.style.width = Math.min(100, ((t - now.start) / (now.end - now.start)) * 100) + '%';
            s.parts.left.textContent = I18n.t('epg.minLeft', { m: Math.max(1, Math.round((now.end - t) / 60000)) });
        },
    };
};
