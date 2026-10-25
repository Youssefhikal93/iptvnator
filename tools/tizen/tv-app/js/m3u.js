// M3U playlist source: downloaded and parsed on the TV. Groups
// (group-title / #EXTGRP) become categories; Live TV is the only section.
window.M3uSource = function (source) {
    'use strict';

    var parsed = null;

    function attr(line, name) {
        var match = new RegExp(name + '="([^"]*)"', 'i').exec(line);
        return match ? match[1].trim() : '';
    }

    function parse(text) {
        var channels = [];
        var groups = {};
        var order = [];
        var pending = null;
        text.split(/\r?\n/).forEach(function (raw) {
            var line = raw.trim();
            if (!line) return;
            if (line.indexOf('#EXTINF') === 0) {
                // The title follows the first comma after the last quoted attribute.
                var tail = line.slice(line.lastIndexOf('"') + 1);
                var comma = tail.indexOf(',');
                pending = {
                    name: comma >= 0 ? tail.slice(comma + 1).trim() : '',
                    logo: attr(line, 'tvg-logo'),
                    group: attr(line, 'group-title'),
                };
            } else if (line.indexOf('#EXTGRP:') === 0) {
                if (pending && !pending.group) pending.group = line.slice(8).trim();
            } else if (line.charAt(0) !== '#') {
                var channel = pending || {};
                channel.url = line;
                channel.name = channel.name || line;
                channel.group = channel.group || 'Other';
                channel.num = channels.length + 1;
                channels.push(channel);
                if (!groups[channel.group]) {
                    groups[channel.group] = [];
                    order.push(channel.group);
                }
                groups[channel.group].push(channel);
                pending = null;
            }
        });
        return { channels: channels, groups: groups, order: order };
    }

    function load() {
        if (parsed) return Promise.resolve(parsed);
        return fetch(source.url.trim())
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.text();
            })
            .then(function (text) {
                if (text.indexOf('#EXTINF') === -1) throw new Error('not an M3U playlist');
                parsed = parse(text);
                return parsed;
            });
    }

    function playbackChain(url) {
        if (/\.m3u8(\?|$)/i.test(url)) return [{ via: 'hls', url: url }, { via: 'avplay', url: url }];
        return [
            { via: 'mpegts', url: url },
            { via: 'hls', url: url },
            { via: 'avplay', url: url },
        ];
    }

    return {
        sections: ['live'],
        account: function () {
            return load().then(function (p) {
                return { channels: p.channels.length, groups: p.order.length };
            });
        },
        categories: function () {
            return load().then(function (p) {
                return [{ category_id: '', category_name: 'All channels', count: p.channels.length }].concat(
                    p.order.map(function (group) {
                        return { category_id: group, category_name: group, count: p.groups[group].length };
                    })
                );
            });
        },
        items: function (section, categoryId) {
            return load().then(function (p) {
                return categoryId ? p.groups[categoryId] || [] : p.channels;
            });
        },
        liveRequest: function (channel) {
            return { live: true, title: channel.num + '. ' + channel.name, sources: playbackChain(channel.url) };
        },
    };
};
