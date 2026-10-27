// Watched actions share the player's progress; show badges use known episodes
// only, so rendering a list never asks the source for show details.
window.Watched = function (api) {
    'use strict';

    function isWatched(item, section) {
        if (section === 'live') return false;
        if (section !== 'series' || item.episode) return Progress.isWatched(Progress.id(section, item), item.sourceId);
        var info = api.knownShow(item);
        return Progress.allWatched(info && info.episodes, item.sourceId);
    }

    function itemOption(item, section) {
        var id = Progress.id(section, item);
        var done = Progress.isWatched(id, item.sourceId);
        return {
            label: I18n.t((item.episode ? 'watched.markEpisode' : 'watched.markAs') + (done ? '.unwatched' : '.watched')),
            run: function () {
                Progress.mark([id], !done, [item.seconds], item.sourceId);
                api.changed();
            },
        };
    }

    function episodesOption(label, episodes) {
        var done = Progress.allWatched(episodes);
        return {
            label: I18n.t(label + (done ? '.unwatched' : '.watched')),
            run: function () {
                Progress.mark(episodes.map(Progress.episodeId), !done, episodes.map(function (ep) { return ep.seconds; }));
                api.changed();
            },
        };
    }

    function openShowMenu(item, options, title) {
        var current = Menu.open(title, [{ label: I18n.t('episodes.loading') }, { label: I18n.t('common.cancel') }]);
        api.loadShow(item).then(function (info) {
            if (!current()) return;
            if (info.episodes && info.episodes.length) options.splice(options.length - 1, 0, episodesOption('watched.markShow', info.episodes));
            else api.toast(I18n.t('episodes.none'));
            Menu.open(title, options);
        }).catch(function () {
            if (!current()) return;
            api.toast(I18n.t('watched.loadFailed'));
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
            episodesOption('watched.markSeason', season),
            { label: I18n.t('common.cancel') },
        ]);
    }

    return {
        isWatched: isWatched,
        openItemMenu: openItemMenu,
        openEpisodeMenu: openEpisodeMenu,
    };
};
