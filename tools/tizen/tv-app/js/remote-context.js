// Context order is shared by the player bridge and its tests; unavailable
// actions never reach the phone, and are checked again when tapped.
window.RemoteContext = (function () {
    'use strict';
    var order = { episode: ['next', 'skip', 'subtitles', 'audio'], film: ['subtitles', 'audio', 'sync', 'speed'], live: ['startover', 'lastch', 'channels', 'subtitles'], details: ['play', 'trailer', 'favourite'], saver: ['wake'] };
    function select(kind, offered) {
        return (order[kind] || []).filter(function (id) { return !!offered[id]; }).map(function (id) {
            return { id: id, label: offered[id].label.replace(/^[\u25b6\u2605\u2606\s]+/, ''), run: offered[id].run };
        });
    }
    function section(browser, playing) {
        if (playing) return playing.live ? 'live' : playing.episodes ? 'series' : 'movies';
        return browser.detail ? browser.detail.section : browser.section;
    }
    return { select: select, section: section };
})();
