// Only a screenful of rows and the three visible hours become DOM nodes.
window.GuideView = function (el) {
    'use strict';

    var rows;
    var marks;
    var nowLine;
    var popup;

    function node(tag, className, text) {
        var child = document.createElement(tag);
        child.className = className;
        if (text !== undefined) child.textContent = text;
        return child;
    }

    function clock(time) {
        var date = new Date(time);
        return ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);
    }

    function day(time) {
        return new Date(time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    }

    function build(title) {
        el.innerHTML = '';
        el.appendChild(node('h1', 'gd-title', 'TV guide'));
        el.appendChild(node('p', 'gd-category', title));
        var header = node('div', 'gd-header');
        header.appendChild(node('div', 'gd-channel', 'Channel'));
        marks = node('div', 'gd-marks');
        header.appendChild(marks);
        el.appendChild(header);
        var body = node('div', 'gd-body');
        rows = node('div', 'gd-rows');
        body.appendChild(rows);
        var timeline = node('div', 'gd-timeline');
        nowLine = node('div', 'gd-now-line');
        nowLine.setAttribute('aria-label', 'Now');
        timeline.appendChild(nowLine);
        body.appendChild(timeline);
        el.appendChild(body);
        el.appendChild(node('p', 'gd-hints', 'Arrows: move \u00b7 OK: watch / programme details \u00b7 CH +/-: page \u00b7 Return: Live TV'));
        popup = node('div', 'gd-popup hidden');
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-label', 'Programme details');
        el.appendChild(popup);
    }

    function times(start) {
        marks.innerHTML = '';
        marks.setAttribute('data-start', start);
        for (var time = Math.ceil(start / GuideTime.step) * GuideTime.step; time < start + GuideTime.span; time += GuideTime.step) {
            var mark = node('span', 'gd-mark', clock(time));
            mark.style.left = (time - start) / GuideTime.span * 100 + '%';
            marks.appendChild(mark);
        }
        nowLine.style.left = (Date.now() - start) / GuideTime.span * 100 + '%';
        nowLine.classList.toggle('hidden', Date.now() < start || Date.now() >= start + GuideTime.span);
        el.querySelector('.gd-category').textContent = el.getAttribute('data-category') + ' \u00b7 ' + day(start);
    }

    function block(programme, frame) {
        var start = Math.max(programme.start, frame.start);
        var end = Math.min(programme.end, frame.start + GuideTime.span);
        var current = programme.start <= Date.now() && Date.now() < programme.end;
        var focused = frame.selected && programme === GuideTime.at(frame.programmes, frame.time);
        var tile = node('div', 'gd-programme' + (current ? ' current' : '') + (focused ? ' focused' : ''));
        tile.style.left = (start - frame.start) / GuideTime.span * 100 + '%';
        tile.style.width = (end - start) / GuideTime.span * 100 + '%';
        tile.setAttribute('data-start', programme.start);
        tile.setAttribute('data-end', programme.end);
        tile.appendChild(node('strong', '', programme.title));
        if (programme.end <= Date.now() && CatchUp.playable(frame.channel, programme)) {
            var archive = node('span', 'gd-catch-up', '\u21ba');
            archive.setAttribute('aria-label', 'Catch-up available');
            tile.appendChild(archive);
        }
        tile.appendChild(node('small', '', clock(programme.start) + ' - ' + clock(programme.end)));
        return tile;
    }

    function row(frame) {
        var strip = node('div', 'gd-row' + (frame.selected ? ' selected' : ''));
        strip.setAttribute('data-index', frame.index);
        strip.setAttribute('data-channel', frame.channel.stream_id === undefined ? frame.channel.url : frame.channel.stream_id);
        strip.appendChild(node('div', 'gd-channel', (frame.channel.num || frame.index + 1) + '. ' + frame.channel.name));
        var track = node('div', 'gd-track');
        strip.appendChild(track);
        if (frame.programmes === undefined) {
            track.appendChild(node('div', 'gd-loading skeleton', 'Loading programmes\u2026'));
        } else {
            frame.programmes.forEach(function (programme) {
                if (programme.end > frame.start && programme.start < frame.start + GuideTime.span) track.appendChild(block(programme, frame));
            });
            if (!track.childNodes.length) track.appendChild(node('div', 'gd-empty', 'No programme information'));
        }
        var old = rows.querySelector('[data-index="' + frame.index + '"]');
        if (old) rows.replaceChild(strip, old);
        else rows.appendChild(strip);
    }

    function details(programme, playable) {
        popup.innerHTML = '';
        var card = node('div', 'gd-popup-card');
        card.appendChild(node('h2', '', programme.title));
        card.appendChild(node('p', 'gd-popup-time', day(programme.start) + ' \u00b7 ' + clock(programme.start) + ' - ' + clock(programme.end)));
        card.appendChild(node('p', 'gd-description', programme.desc || 'No description available'));
        if (playable) card.appendChild(node('button', 'state-button gd-watch', 'Watch from start'));
        card.appendChild(node('p', 'gd-hints', playable ? 'OK: Watch from start \u00b7 Return: close' : 'OK / Return: close'));
        popup.appendChild(card);
        popup.classList.remove('hidden');
        if (playable) popup.querySelector('button').focus();
    }

    return {
        open: function (title) {
            el.setAttribute('data-category', title);
            build(title);
            el.classList.remove('hidden');
        },
        times: times,
        row: row,
        clearRows: function () { rows.innerHTML = ''; },
        empty: function () { rows.appendChild(node('p', 'gd-empty', 'No channels in this category')); },
        details: details,
        closeDetails: function () { popup.classList.add('hidden'); },
        hide: function () { el.classList.add('hidden'); },
        show: function () { el.classList.remove('hidden'); },
    };
};
