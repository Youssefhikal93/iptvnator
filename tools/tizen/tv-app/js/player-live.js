// The live player's info and bar (#97): channel, programme, a LIVE or
// "−1:05" badge and one programme bar instead of a film timeline. Used for
// every live channel and for a catch-up channel played behind live; the
// buttons below it come from PlayerSeries. Films keep their own bar.
window.PlayerLive = function (api) {
    'use strict';

    var HOUR = 3600000;
    var QUARTER = 900000;

    function el(tag, cls, text) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    var dock = document.querySelector('#pl-controls .pl-dock');
    var info = el('div', 'pl-lv-info');
    info.id = 'pl-live-info';
    var main = el('div', 'pl-lv-main');
    var head = el('div', 'pl-lv-head');
    var plate = el('span', 'pl-lv-plate');
    var name = el('span', 'pl-lv-name');
    var zap = el('span', 'pl-lv-zap');
    head.appendChild(plate);
    head.appendChild(name);
    head.appendChild(zap);
    main.appendChild(head);
    // Now and Next (PlayerEpg) sits under the channel; the badge to its right.
    var epgBox = document.getElementById('pl-epg');
    if (epgBox) main.appendChild(epgBox);
    var side = el('div', 'pl-lv-side');
    var liveBadge = document.getElementById('pl-live');
    if (liveBadge) side.appendChild(liveBadge);
    var behindPill = el('span', 'pl-lv-behind hidden');
    behindPill.id = 'pl-behind';
    side.appendChild(behindPill);
    info.appendChild(main);
    info.appendChild(side);
    // Without the player's dock (a bare page) the parts stay detached.
    if (dock) dock.insertBefore(info, dock.firstChild);

    var barBox = el('div', 'pl-lv-barbox');
    barBox.id = 'pl-live-bar';
    var bar = el('div', 'pl-lv-bar');
    var buf = el('div', 'pl-lv-buf');
    var fill = el('div', 'pl-lv-fill');
    var edge = el('div', 'pl-lv-edge');
    var knob = el('div', 'pl-lv-knob');
    var tip = el('div', 'pl-lv-tip');
    [buf, fill, edge, knob, tip].forEach(function (part) { bar.appendChild(part); });
    var times = el('div', 'pl-lv-times');
    var from = el('span');
    var to = el('span');
    times.appendChild(from);
    times.appendChild(to);
    barBox.appendChild(bar);
    barBox.appendChild(times);
    if (dock) dock.insertBefore(barBox, document.getElementById('pl-seekbox'));

    var plateKey = null;

    // The live channel behind a request: itself, or the one a timeshift returns to.
    function liveOf(req) {
        if (!req) return null;
        if (req.live) return req;
        return req.liveTimeshift && req.returnTo ? req.returnTo : null;
    }

    function percent(time, start, end) {
        return Math.max(0, Math.min(100, ((time - start) / (end - start)) * 100)) + '%';
    }

    function renderHead(channel, catchUp) {
        var b = channel.banner || { name: channel.title || '' };
        var key = (b.logo || '') + '|' + b.name;
        if (key !== plateKey) {
            plateKey = key;
            plate.textContent = '';
            plate.appendChild(Kit.plateNode({ cls: 'pl-lv-logo', name: b.name || '?', logo: b.logo || '' }));
        }
        name.textContent = I18n.isolate((b.num ? b.num + '  ' : '') + (b.name || channel.title || ''));
        // ▲▼ change channel unless they move between the bar and the buttons.
        zap.textContent = catchUp ? 'CH + / −' : '▲▼';
    }

    // The bar spans the programme on now; without a guide, a catch-up
    // channel's last hour. It stretches back when playback is earlier.
    function renderBar(catchUp, behind, onBar) {
        var now = Date.now();
        var at = now - behind;
        var programme = api.programmes().now;
        var start;
        var end;
        if (programme && programme.start <= now && now < programme.end) {
            start = programme.start;
            end = programme.end;
        } else if (catchUp) {
            end = now;
            start = now - HOUR;
        } else return barBox.classList.add('hidden');
        if (at < start) start = Math.floor(at / QUARTER) * QUARTER;
        barBox.classList.remove('hidden');
        barBox.classList.toggle('behind', behind > 0);
        barBox.classList.toggle('focus', !!onBar);
        buf.style.width = catchUp ? percent(now, start, end) : '0';
        fill.style.width = percent(at, start, end);
        edge.classList.toggle('hidden', !catchUp);
        edge.style.left = percent(now, start, end);
        knob.classList.toggle('hidden', !catchUp || !(behind > 0 || onBar));
        knob.style.left = percent(at, start, end);
        tip.classList.toggle('hidden', !onBar);
        tip.style.left = percent(at, start, end);
        tip.textContent = I18n.time(at);
        from.textContent = I18n.time(start);
        to.textContent = I18n.time(end);
    }

    return {
        applies: function (req) {
            return !!liveOf(req);
        },
        render: function () {
            var req = api.current();
            var channel = liveOf(req);
            if (!channel || !dock) return;
            var catchUp = !!req.liveReplay;
            var behind = api.behind();
            renderHead(channel, catchUp);
            behindPill.classList.toggle('hidden', !(behind > 0));
            behindPill.textContent = '−' + api.clock(behind);
            renderBar(catchUp, behind, api.onBar());
        },
    };
};
