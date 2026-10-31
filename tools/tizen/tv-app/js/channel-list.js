// A window of live channels over playback; focus never opens a stream.
window.ChannelList = function (hooks) {
    'use strict';

    var ROWS = 9;
    var KEY = Keys;
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
    var onPick = null;
    var loading = false;
    var pending = [];

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
        loading = false;
        pending = [];
        onPick = null;
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
        node.appendChild(Kit.plateNode({ cls: 'pl-channel-logo', name: channel.name || '?', logo: channel.stream_icon || channel.logo || '' }));
        var label = element('div', 'pl-channel-label');
        label.appendChild(element('div', 'pl-channel-name', I18n.isolate(channel.name || I18n.t('player.hint.channel'))));
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
        panel.appendChild(element('div', 'pl-channel-header', '\u25c0  ' + (category ? I18n.categoryName(category) : I18n.t('player.hint.channelList')) + '  \u25b6'));
        // Empty / one / short / long lists all keep focus inside the window.
        var start = Math.max(0, Math.min(focus - Math.floor(ROWS / 2), channels.length - ROWS));
        var visible = channels.slice(start, start + ROWS);
        var list = element('div', 'pl-channel-rows');
        visible.forEach(function (channel, i) { list.appendChild(row(channel, start + i)); });
        if (!visible.length) list.appendChild(element('div', 'pl-channel-empty', message || I18n.t('empty.category.title')));
        panel.appendChild(list);
        panel.appendChild(element('div', 'pl-channel-hint', I18n.t('channels.hint')));
        wantProgrammes(visible.filter(function (channel) { return channel.stream_id !== undefined; }));
    }

    function failed(mine) {
        if (!opened || mine !== token) return;
        loading = false;
        pending = [];
        channels = [];
        message = I18n.t('channels.loadFailed');
        render();
        Log.error('CHANNEL LIST FAIL');
    }

    function load(channel) {
        var mine = ++token;
        loading = true;
        channels = [];
        focus = 0;
        message = I18n.t('common.loadingEllipsis');
        render();
        var category = categories[categoryIndex];
        if (!category) {
            loading = false;
            pending = [];
            message = I18n.t('browser.noCategories');
            return render();
        }
        if (hooks.unlock && hooks.unlock(category, function () {
            if (opened && mine === token) load(channel);
        })) {
            // Waiting for the PIN (or it was cancelled): say why the list is empty.
            loading = false;
            pending = [];
            message = I18n.t('empty.locked.title');
            return render();
        }
        hooks.channels.channels(category.category_id).then(function (loaded) {
            if (!opened || mine !== token) return;
            channels = loaded;
            focus = Math.max(0, hooks.channels.indexOf(channels, channel));
            message = '';
            loading = false;
            render();
            // Visibility precedes catalogue loading. Replay remote input against
            // the resolved focus, and never carry it past closing this list.
            while (opened && !loading && pending.length) key(pending.shift());
        }).catch(function () { failed(mine); });
    }

    function sync() {
        var mine = ++token;
        loading = true;
        pending = [];
        channels = [];
        categories = [];
        message = I18n.t('common.loadingEllipsis');
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
        // Zapping from Recent follows the channel's own category, not this short list.
        var recent = categories[categoryIndex] && categories[categoryIndex].recent;
        var selection = { channel: channels[focus], channels: recent ? null : channels.slice(), category: recent ? null : categories[categoryIndex].category_id };
        var complete = onPick;
        var request = hooks.channels.play(selection.channel, selection.channels, selection.category);
        close();
        if (request) {
            if (complete) complete(request, selection);
            else hooks.play(request);
        }
    }

    function key(code) {
        if (!opened) return false;
        touch();
        // Picking for a multi-view tile: CH +/- must not zap the tile behind the list.
        if (onPick && (code === KEY.CH_UP || code === KEY.CH_DOWN)) return true;
        if ([KEY.CH_UP, KEY.CH_DOWN, KEY.GREEN, KEY.PREVIOUS_CHANNEL, KEY.STOP].indexOf(code) >= 0) return false;
        if ([KEY.YELLOW, KEY.INFO].indexOf(code) >= 0) {
            close();
            return false;
        }
        if (loading && [KEY.UP, KEY.DOWN, KEY.LEFT, KEY.RIGHT, KEY.ENTER].indexOf(code) >= 0) {
            pending.push(code);
            return true;
        }
        if (Keys.isBack(code)) close();
        else if (code === KEY.UP || code === KEY.DOWN) {
            focus = Math.max(0, Math.min(channels.length - 1, focus + (code === KEY.UP ? -1 : 1)));
            render();
        } else if (code === KEY.LEFT || code === KEY.RIGHT) switchCategory(code === KEY.LEFT ? -1 : 1);
        else if (code === KEY.ENTER) watch();
        return true;
    }

    return {
        open: function (pick) {
            onPick = pick || null;
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
