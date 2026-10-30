// Live playback history and catalogue access, shared by zapping and the drawer.
window.LiveChannels = function (hooks) {
    'use strict';

    var RECENT_ID = '__recentch';
    var current = null;
    var previous = null;
    var context = null;
    var zapList = [];
    var generation = 0;

    function recent() {
        return hooks.recent ? hooks.recent() : [];
    }

    function indexOf(channels, channel) {
        var key = channel && Library.keyOf('live', channel);
        for (var i = 0; i < channels.length; i++) {
            if (Library.keyOf('live', channels[i]) === key) return i;
        }
        return -1;
    }

    function categoryOf(channel) {
        return channel.category_id !== undefined && channel.category_id !== null ? String(channel.category_id) : channel.group || '';
    }

    function prepareZapping(channel) {
        var mine = generation;
        hooks.channels(categoryOf(channel)).then(function (channels) {
            if (mine === generation) zapList = channels;
        }).catch(function () {
            Log.error('LIVE CHANNELS FAIL');
        });
    }

    function play(channel, channels, category) {
        if (hooks.allows && !hooks.allows(channel)) return null;
        if (current && Library.keyOf('live', current) !== Library.keyOf('live', channel)) previous = { channel: current, channels: zapList, category: context };
        current = channel;
        context = category === undefined ? null : category;
        generation++;
        zapList = channels || [];
        if (!channels) prepareZapping(channel);
        hooks.record(channel);
        return hooks.request(channel);
    }

    // Old library snapshots may lack a category; resolve them in the catalogue.
    function locate() {
        var channel = current;
        if (!channel || (channel.category_id !== undefined && channel.category_id !== null) || channel.group) return Promise.resolve(channel);
        return hooks.channels('').then(function (channels) {
            var index = indexOf(channels, channel);
            return index < 0 ? channel : channels[index];
        });
    }

    return {
        play: play,
        // The drawer's Recent row (#80) lists the Recent channels, not a catalogue category.
        channels: function (categoryId) {
            return categoryId === RECENT_ID ? Promise.resolve(recent()) : hooks.channels(categoryId);
        },
        indexOf: indexOf,
        current: function () {
            return current;
        },
        reorder: function (category, channels) {
            if (context === category) zapList = channels;
        },
        reset: function () {
            generation++;
            current = previous = context = null;
            zapList = [];
        },
        zap: function (delta) {
            if (hooks.allows) zapList = zapList.filter(hooks.allows);
            var index = indexOf(zapList, current);
            if (index < 0 || index + delta < 0 || index + delta >= zapList.length) return null;
            return play(zapList[index + delta], zapList, context);
        },
        previous: function () {
            return previous ? play(previous.channel, previous.channels, previous.category) : null;
        },
        allows: function (channel) { return !hooks.allows || hooks.allows(channel); },
        view: function () {
            var categories;
            return hooks.categories().then(function (rows) {
                categories = rows;
                return locate();
            }).then(function (channel) {
                // Recent shows once there is something in it: in its saved
                // place in the category order, or first.
                var shown = recent();
                var placed = categories.some(function (category) { return category.category_id === RECENT_ID; });
                if (!placed) categories = [{ category_id: RECENT_ID }].concat(categories);
                categories = categories.filter(function (category) { return category.category_id !== RECENT_ID || shown.length; }).map(function (category) {
                    return category.category_id === RECENT_ID ? { category_id: RECENT_ID, category_name: I18n.t('recent.title'), recent: true, count: shown.length } : category;
                });
                var index = categories[0] && categories[0].recent ? 1 : 0;
                categories.forEach(function (category, i) {
                    if (String(category.category_id) === '') index = i;
                });
                categories.forEach(function (category, i) {
                    if (channel && String(category.category_id) === categoryOf(channel)) index = i;
                });
                if (context !== null) categories.forEach(function (category, i) {
                    if (String(category.category_id) === String(context)) index = i;
                });
                return { categories: categories, index: index, channel: channel };
            });
        },
        last: function (sourceId) {
            var saved = Library.lastChannel(sourceId);
            if (!saved || Prefs.get('onStart') !== 'last-channel') return Promise.resolve(null);
            return hooks.channels('').then(function (channels) {
                var index = indexOf(channels, saved);
                return index < 0 ? null : channels[index];
            });
        },
    };
};
