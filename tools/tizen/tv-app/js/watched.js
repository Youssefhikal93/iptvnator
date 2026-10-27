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
            glyph: '✓',
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
            glyph: '✓',
            run: function () {
                Progress.mark(episodes.map(Progress.episodeId), !done, episodes.map(function (ep) { return ep.seconds; }));
                api.changed();
            },
        };
    }

    // Return closes the sheet, so it has no Cancel row (#48).
    function openShowMenu(item, options, title, header) {
        var current = Menu.open(title, [{ label: I18n.t('episodes.loading'), note: true }], 0, header);
        api.loadShow(item).then(function (info) {
            if (!current()) return;
            if (info.episodes && info.episodes.length) options.push(episodesOption('watched.markShow', info.episodes));
            else api.toast(I18n.t('episodes.none'));
            Menu.open(title, options, 0, header);
        }).catch(function () {
            if (!current()) return;
            api.toast(I18n.t('watched.loadFailed'));
            Menu.open(title, options, 0, header);
        });
    }

    function openItemMenu(item, section, options, title, header) {
        if (section === 'series' && !item.episode) return openShowMenu(item, options, title, header);
        if (section === 'movies' || item.episode) options.push(itemOption(item, section));
        Menu.open(title, options, 0, header);
    }

    function openEpisodeMenu(selection) {
        var ep = selection.episode;
        var season = selection.list.filter(function (episode) {
            return episode.season === ep.season;
        });
        Menu.open(ep.label || ep.title, [
            itemOption({ episode: ep, seconds: ep.seconds }, 'series'),
            episodesOption('watched.markSeason', season),
        ]);
    }

    return {
        isWatched: isWatched,
        openItemMenu: openItemMenu,
        openEpisodeMenu: openEpisodeMenu,
    };
};
