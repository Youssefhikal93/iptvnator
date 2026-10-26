// Watched actions share the player's progress; show badges use known episodes
// only, so rendering a list never asks the source for show details.
window.Watched = function (api) {
    'use strict';

    function isWatched(item, section) {
        if (section === 'live') return false;
        if (section !== 'series' || item.episode) return Progress.isWatched(Progress.id(section, item));
        var info = api.knownShow(item);
        return Progress.allWatched(info && info.episodes);
    }

    function itemOption(item, section) {
        var id = Progress.id(section, item);
        var done = Progress.isWatched(id);
        return {
            label: item.episode ? 'Mark episode ' + (done ? 'unwatched' : 'watched') : 'Mark as ' + (done ? 'unwatched' : 'watched'),
            run: function () {
                Progress.mark([id], !done, [item.seconds]);
                api.changed();
            },
        };
    }

    function episodesOption(label, episodes) {
        var done = Progress.allWatched(episodes);
        return {
            label: label + ' ' + (done ? 'unwatched' : 'watched'),
            run: function () {
                Progress.mark(episodes.map(Progress.episodeId), !done, episodes.map(function (ep) { return ep.seconds; }));
                api.changed();
            },
        };
    }

    function openShowMenu(item, options, title) {
        var current = Menu.open(title, [{ label: 'Loading episodes\u2026' }, { label: 'Cancel' }]);
        api.loadShow(item).then(function (info) {
            if (!current()) return;
            if (info.episodes && info.episodes.length) options.splice(options.length - 1, 0, episodesOption('Mark show as', info.episodes));
            else api.toast('No episodes');
            Menu.open(title, options);
        }).catch(function () {
            if (!current()) return;
            api.toast('Could not load episodes. Hold OK to try again.');
            Menu.open(title, options);
        });
    }

    function openItemMenu(item, section, options, title) {
        if (section === 'series' && !item.episode) return openShowMenu(item, options, title);
        if (section === 'movies' || item.episode) options.splice(options.length - 1, 0, itemOption(item, section));
        Menu.open(title, options);
    }

    function openEpisodeMenu(selection) {
        var ep = selection.episode;
        var season = selection.list.filter(function (episode) {
            return episode.season === ep.season;
        });
        Menu.open(ep.label || ep.title, [
            itemOption({ episode: ep, seconds: ep.seconds }, 'series'),
            episodesOption('Mark season', season),
            { label: 'Cancel' },
        ]);
    }

    return {
        isWatched: isWatched,
        openItemMenu: openItemMenu,
        openEpisodeMenu: openEpisodeMenu,
    };
};
