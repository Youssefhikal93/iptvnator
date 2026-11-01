window.PlayerRemote = function (api) {
    'use strict';
    function groups() {
        var list = [];
        var group = null;
        api.entries({ head: function (label) { group = { label: label, items: [] }; list.push(group); }, item: function (label, active, run) { if (group) group.items.push({ label: label, run: run }); }, note: function () {}, info: function () {} });
        return list;
    }
    function state() {
        var req = api.current();
        if (!req) return null;
        var offered = {};
        var menu = groups();
        ['audio', 'subtitles', 'speed'].forEach(function (id) {
            var label = I18n.t(id === 'subtitles' ? 'picture.subtitles' : 'player.' + id);
            var group = menu.filter(function (entry) { return entry.label === label; })[0];
            var choices = group ? group.items.filter(function (entry) { return !!entry.run; }).length : 0;
            if (choices > (id === 'audio' ? 1 : 0)) offered[id] = { label: id === 'speed' ? I18n.t('remote.speed') : label, run: function () { api.openMenu(); api.menuGroup(label); } };
        });
        menu.forEach(function (group) { group.items.forEach(function (entry) {
            if (entry.label === I18n.t('opensubs.syncOpen') && entry.run) offered.sync = { label: entry.label, run: entry.run };
        }); });
        if (req.live && api.startOverAvailable()) offered.startover = { label: I18n.t('player.startOver'), run: api.startOver };
        var series = api.series.remote();
        if (series.next) offered.next = { label: I18n.t('remote.next'), run: series.next };
        if (series.skip) offered.skip = { label: I18n.t('player.skipIntro'), run: series.skip };
        var kind = req.live ? 'live' : req.episodes ? 'episode' : 'film';
        var programme = req.live && api.programmes().now;
        var position = programme ? Date.now() - programme.start : api.position();
        var duration = programme ? programme.end - programme.start : api.duration();
        return { kind: kind, playing: true, seek: !req.live && api.ready(), title: req.title || '', art: req.title || 'Jotv', subtitle: programme ? programme.title : req.subtitle || '',
            elapsed: api.clock(position), duration: api.clock(duration), progress: duration > 0 ? position * 100 / duration : 0, offered: api.ready() ? offered : {} };
    }
    return { state: state };
};
