// Live playback history and catalogue access, shared by zapping and the drawer.
window.LiveChannels = function (hooks) {
    'use strict';

    var RECENT_ID = '__recentch';
    var current = null;
    var previous = null;
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

    function play(channel, channels) {
        if (hooks.allows && !hooks.allows(channel)) return null;
        if (current && Library.keyOf('live', current) !== Library.keyOf('live', channel)) previous = current;
        current = channel;
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
        reset: function () {
            generation++;
            current = previous = null;
            zapList = [];
        },
        zap: function (delta) {
            if (hooks.allows) zapList = zapList.filter(hooks.allows);
            var index = indexOf(zapList, current);
            if (index < 0 || index + delta < 0 || index + delta >= zapList.length) return null;
            return play(zapList[index + delta], zapList);
        },
        previous: function () {
            return previous ? play(previous) : null;
        },
        allows: function (channel) { return !hooks.allows || hooks.allows(channel); },
        view: function () {
            return Promise.all([hooks.categories(), locate()]).then(function (parts) {
                var categories = parts[0];
                var channel = parts[1];
                var index = 0;
                categories.forEach(function (category, i) {
                    if (channel && String(category.category_id) === categoryOf(channel)) index = i;
                });
                // Recent comes first, once there is something in it.
                var shown = recent();
                if (shown.length) {
                    categories = [{ category_id: RECENT_ID, category_name: I18n.t('recent.title'), recent: true, count: shown.length }].concat(categories);
                    index++;
                }
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
