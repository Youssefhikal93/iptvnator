// A window of live channels over playback; focus never opens a stream.
window.ChannelList = function (hooks) {
    'use strict';

    var ROWS = 9;
    var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, RETURN: 10009, BACKSPACE: 8, ESCAPE: 27, CH_UP: 427, CH_DOWN: 428, PREVIOUS: 10190, GREEN: 404, STOP: 413, YELLOW: 405, INFO: 457 };
    var panel = document.createElement('div');
    panel.id = 'pl-channels';
    panel.className = 'hidden';
    document.getElementById('player').appendChild(panel);
    var opened = false;
    var categories = [];
    var categoryIndex = 0;
    var channels = [];
    var focus = 0;
    var token = 0;
    var hideTimer = null;
    var epgTimer = null;
    var message = '';

    function element(tag, className, text) {
        var node = document.createElement(tag);
        node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function touch() {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(close, 10000);
    }

    function close() {
        opened = false;
        hooks.visibility(false);
        token++;
        clearTimeout(hideTimer);
        clearTimeout(epgTimer);
        panel.classList.add('hidden');
    }

    function programme(node, channel) {
        var epg = hooks.epg();
        var known = epg && channel.stream_id !== undefined && epg.peek(channel);
        if (known && known.now) node.appendChild(element('div', 'pl-channel-now', known.now.title));
    }

    function row(channel, index) {
        var node = element('div', 'pl-channel' + (index === focus ? ' focused' : ''));
        var logo = element('div', 'pl-channel-logo', String(channel.name || '?').slice(0, 2).toUpperCase());
        var url = channel.stream_icon || channel.logo;
        if (url) {
            var image = element('img', '');
            image.src = url;
            image.onerror = function () { image.remove(); };
            logo.appendChild(image);
        }
        node.appendChild(logo);
        var label = element('div', 'pl-channel-label');
        label.appendChild(element('div', 'pl-channel-name', channel.name || 'Channel'));
        programme(label, channel);
        node.appendChild(label);
        return node;
    }

    function wantProgrammes(visible) {
        clearTimeout(epgTimer);
        var mine = token;
        epgTimer = setTimeout(function () {
            var epg = hooks.epg();
            if (!epg) return;
            epg.want(visible, 12, function () {
                if (opened && mine === token) render();
            });
        }, 300);
    }

    function render() {
        panel.textContent = '';
        var category = categories[categoryIndex];
        panel.appendChild(element('div', 'pl-channel-header', '\u25c0  ' + (category ? category.category_name : 'Channel list') + '  \u25b6'));
        // Empty / one / short / long lists all keep focus inside the window.
        var start = Math.max(0, Math.min(focus - Math.floor(ROWS / 2), channels.length - ROWS));
        var visible = channels.slice(start, start + ROWS);
        var list = element('div', 'pl-channel-rows');
        visible.forEach(function (channel, i) { list.appendChild(row(channel, start + i)); });
        if (!visible.length) list.appendChild(element('div', 'pl-channel-empty', message || 'Empty category'));
        panel.appendChild(list);
        panel.appendChild(element('div', 'pl-channel-hint', 'OK: watch \u00b7 \u25c0 \u25b6: category \u00b7 Return: close'));
        wantProgrammes(visible.filter(function (channel) { return channel.stream_id !== undefined; }));
    }

    function failed(mine) {
        if (!opened || mine !== token) return;
        channels = [];
        message = 'Could not load channels';
        render();
        Log.error('CHANNEL LIST FAIL');
    }

    function load(channel) {
        var mine = ++token;
        channels = [];
        focus = 0;
        message = 'Loading\u2026';
        render();
        var category = categories[categoryIndex];
        if (!category) {
            message = 'No categories';
            return render();
        }
        hooks.channels.channels(category.category_id).then(function (loaded) {
            if (!opened || mine !== token) return;
            channels = loaded;
            focus = Math.max(0, hooks.channels.indexOf(channels, channel));
            message = '';
            render();
        }).catch(function () { failed(mine); });
    }

    function sync() {
        var mine = ++token;
        channels = [];
        categories = [];
        message = 'Loading\u2026';
        render();
        hooks.channels.view().then(function (view) {
            if (!opened || mine !== token) return;
            categories = view.categories;
            categoryIndex = view.index;
            load(view.channel);
        }).catch(function () { failed(mine); });
    }

    function switchCategory(step) {
        if (!categories.length) return;
        categoryIndex = (categoryIndex + step + categories.length) % categories.length;
        load(null);
    }

    function watch() {
        if (!channels[focus]) return;
        var request = hooks.channels.play(channels[focus], channels);
        close();
        hooks.play(request);
    }

    function key(code) {
        if (!opened) return false;
        touch();
        if ([KEY.CH_UP, KEY.CH_DOWN, KEY.GREEN, KEY.PREVIOUS, KEY.STOP].indexOf(code) >= 0) return false;
        if ([KEY.YELLOW, KEY.INFO].indexOf(code) >= 0) {
            close();
            return false;
        }
        if ([KEY.RETURN, KEY.BACKSPACE, KEY.ESCAPE].indexOf(code) >= 0) close();
        else if (code === KEY.UP || code === KEY.DOWN) {
            focus = Math.max(0, Math.min(channels.length - 1, focus + (code === KEY.UP ? -1 : 1)));
            render();
        } else if (code === KEY.LEFT || code === KEY.RIGHT) switchCategory(code === KEY.LEFT ? -1 : 1);
        else if (code === KEY.ENTER) watch();
        return true;
    }

    return {
        open: function () {
            opened = true;
            hooks.visibility(true);
            panel.classList.remove('hidden');
            touch();
            sync();
        },
        close: close,
        key: key,
        sync: function () {
            if (opened) sync();
        },
    };
};
