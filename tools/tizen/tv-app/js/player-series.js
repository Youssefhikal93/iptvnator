// Series extras for the player: a button row under the timeline (Skip intro,
// Next episode, Episodes, Audio & subtitles), an Up next card that plays the
// next episode when one ends, and an episodes panel with season pills.
//
// A request opts in with `episodes: { items, index, open(i) }` (built by the
// browser); open(i) returns the request for episode i. Xtream has no intro
// markers, so Skip intro jumps the chosen length during an episode's first minutes.
window.PlayerSeries = function (api) {
    'use strict';

    var INTRO = { from: 10000, until: 300000 };
    var UP_NEXT_BEFORE_MS = 30000;
    var PANEL_ROWS = 7;
    var KEY = Keys;

    function $(id) {
        return document.getElementById(id);
    }
    var ui = {
        buttons: $('pl-buttons'),
        skip: $('pl-skip'),
        next: $('pl-next'),
        nextTitle: $('pl-next-title'),
        nextArt: $('pl-next-art'),
        nextCount: $('pl-next-count'),
        panel: $('pl-episodes'),
    };
    var s = fresh();

    function fresh() {
        return { focus: -1, introDone: false, dismissed: false, autoplayAt: 0, panel: null, art: '' };
    }

    function el(tag, cls, text) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function episodes() {
        var req = api.current();
        return req && req.episodes;
    }

    function nextIndex() {
        var eps = episodes();
        return eps && eps.index + 1 < eps.items.length ? eps.index + 1 : -1;
    }

    function inIntro() {
        var pos = api.position();
        return !!episodes() && !s.introDone && !api.isEnded() && pos >= INTRO.from && pos < INTRO.until;
    }

    function buttons() {
        var req = api.current();
        if (!req || req.live) return [];
        var list = [];
        if (inIntro()) list.push({ label: I18n.t('player.skipIntro'), run: skipIntro });
        if (nextIndex() >= 0) list.push({ label: I18n.t('player.nextEpisode'), run: playNext });
        if (episodes()) list.push({ label: I18n.t('player.episodes'), run: openPanel });
        list.push({ label: I18n.t('player.hint.audioSubs'), run: api.openMenu });
        return list;
    }

    function skipIntro() {
        s.introDone = true;
        api.seekTo(api.position() + Prefs.get('skipIntroSeconds') * 1000);
        api.showControls();
    }

    function playEpisode(index) {
        var eps = episodes();
        reset();
        api.play(eps.open(index));
    }

    function playNext() {
        var index = nextIndex();
        if (index >= 0) playEpisode(index);
    }

    // ---- Up next ----------------------------------------------------------

    function upNextShown() {
        if (api.autoplayBlocked()) return false;
        if (nextIndex() < 0 || s.dismissed || s.panel) return false;
        if (api.isEnded()) return true;
        var dur = api.duration();
        return dur > 0 && dur - api.position() <= UP_NEXT_BEFORE_MS;
    }

    function renderUpNext() {
        var shown = upNextShown();
        ui.next.classList.toggle('hidden', !shown);
        if (!shown) {
            s.autoplayAt = 0;
            return;
        }
        var next = episodes().items[nextIndex()];
        ui.nextTitle.textContent = next.label;
        // The episode's still beside its name (#48), set only when it changes.
        var art = next.image || '';
        if (art !== s.art) {
            s.art = art;
            ui.nextArt.src = art;
            ui.nextArt.classList.toggle('hidden', !art);
        }
        var autoplayMs = Prefs.get('autoplayMs');
        if (!api.isEnded() || !autoplayMs) {
            s.autoplayAt = 0;
            ui.next.classList.remove('counting');
            ui.nextCount.textContent = I18n.t('player.nextHide');
            return;
        }
        if (!s.autoplayAt) s.autoplayAt = Date.now() + autoplayMs;
        var left = Math.ceil((s.autoplayAt - Date.now()) / 1000);
        if (left <= 0) return playNext();
        // A bar under the text runs down with the countdown.
        ui.next.classList.add('counting');
        ui.next.style.setProperty('--pl-next-left', Math.max(0, (s.autoplayAt - Date.now()) / autoplayMs));
        ui.nextCount.textContent = I18n.t('player.nextCountdown', { s: left });
    }

    // ---- Episodes panel ---------------------------------------------------

    function seasonsOf(items) {
        var seasons = [];
        items.forEach(function (ep) {
            if (seasons.indexOf(ep.season) === -1) seasons.push(ep.season);
        });
        return seasons;
    }

    function panelEpisodes() {
        var eps = episodes();
        var season = s.panel.seasons[s.panel.season];
        var out = [];
        eps.items.forEach(function (ep, i) {
            if (ep.season === season || s.panel.seasons.length < 2) out.push(i);
        });
        return out;
    }

    function openPanel() {
        var eps = episodes();
        var seasons = seasonsOf(eps.items);
        var season = Math.max(0, seasons.indexOf(eps.items[eps.index].season));
        s.panel = { seasons: seasons, season: season, focus: 0 };
        s.panel.focus = Math.max(0, panelEpisodes().indexOf(eps.index));
        ui.panel.classList.remove('hidden');
        renderPanel();
        api.showControls();
    }

    function closePanel() {
        s.panel = null;
        ui.panel.classList.add('hidden');
    }

    function renderPanel() {
        var eps = episodes();
        var p = s.panel;
        ui.panel.textContent = '';
        ui.panel.appendChild(el('div', 'pl-ep-head', api.current().title));
        if (p.seasons.length > 1) {
            var pills = el('div', 'pl-ep-pills');
            p.seasons.forEach(function (season, i) {
                pills.appendChild(el('span', 'pl-ep-pill' + (i === p.season ? ' active' : ''), I18n.t('episodes.season', { n: season })));
            });
            ui.panel.appendChild(pills);
        }
        var list = panelEpisodes();
        var start = Math.max(0, Math.min(p.focus - Math.floor(PANEL_ROWS / 2), list.length - PANEL_ROWS));
        list.slice(start, start + PANEL_ROWS).forEach(function (index, i) {
            var ep = eps.items[index];
            var row = el('div', 'pl-ep-row' + (start + i === p.focus ? ' focus' : '') + (index === eps.index ? ' playing' : ''));
            row.appendChild(el('span', 'pl-ep-label', String(ep.label).replace(/\s+/g, ' ')));
            if (index === eps.index) row.appendChild(el('span', 'pl-ep-tag', I18n.t('player.playing')));
            var progress = Progress.of(Progress.episodeId(ep));
            if (progress) {
                var bar = el('div', 'pl-ep-bar');
                var fill = el('div', 'pl-ep-fill');
                fill.style.width = Progress.bar(progress.ratio);
                bar.appendChild(fill);
                row.appendChild(bar);
            }
            ui.panel.appendChild(row);
        });
        ui.panel.appendChild(el('div', 'pl-ep-hint', I18n.t('player.episodesHint')));
    }

    function panelKey(code) {
        var p = s.panel;
        if (code === KEY.LEFT || code === KEY.RIGHT) {
            var next = p.season + (code === KEY.LEFT ? -1 : 1);
            if (next >= 0 && next < p.seasons.length) {
                p.season = next;
                p.focus = 0;
            }
        } else if (code === KEY.UP || code === KEY.DOWN) {
            p.focus = Math.max(0, Math.min(panelEpisodes().length - 1, p.focus + (code === KEY.UP ? -1 : 1)));
        } else if (code === KEY.ENTER) {
            var index = panelEpisodes()[p.focus];
            if (index === episodes().index) closePanel();
            else if (index !== undefined) playEpisode(index);
            return true;
        } else if (Keys.isBack(code)) {
            closePanel();
            return true;
        }
        renderPanel();
        return true; // The panel swallows every key.
    }

    // ---- Button row -------------------------------------------------------

    function renderButtons() {
        var list = buttons();
        if (s.focus >= list.length) s.focus = list.length - 1;
        ui.buttons.textContent = '';
        list.forEach(function (button, i) {
            ui.buttons.appendChild(el('span', 'pl-btn' + (i === s.focus ? ' focus' : ''), button.label));
        });
    }

    function buttonsKey(code) {
        var list = buttons();
        if (code === KEY.LEFT && s.focus > 0) s.focus--;
        else if (code === KEY.RIGHT && s.focus < list.length - 1) s.focus++;
        else if (code === KEY.ENTER) {
            var button = list[s.focus];
            s.focus = -1;
            if (button) button.run();
        } else if (code === KEY.UP || Keys.isBack(code)) s.focus = -1;
        else if (code !== KEY.LEFT && code !== KEY.RIGHT && code !== KEY.DOWN) {
            s.focus = -1;
            return false;
        }
        api.showControls();
        return true;
    }

    function reset() {
        s = fresh();
        ui.panel.classList.add('hidden');
        ui.next.classList.add('hidden');
        ui.skip.classList.add('hidden');
    }

    return {
        reset: reset,
        // Keeps the overlay up while the user is on the buttons or the panel.
        busy: function () {
            return s.focus >= 0 || !!s.panel;
        },
        // Called on every player tick and render.
        render: function (controlsOn) {
            renderButtons();
            ui.skip.classList.toggle('hidden', controlsOn || !inIntro());
            renderUpNext();
        },
        onHide: function () {
            s.focus = -1;
        },
        // Returns true when the key was consumed.
        key: function (code) {
            var req = api.current();
            if (!req || req.live) return false;
            if (s.panel) return panelKey(code);
            if (s.focus >= 0) return buttonsKey(code);
            if (upNextShown() && code === KEY.ENTER) return playNext(), true;
            if (upNextShown() && Keys.isBack(code)) {
                s.dismissed = true;
                renderUpNext();
                return true;
            }
            if (code === KEY.DOWN && buttons().length) {
                s.focus = 0;
                api.showControls();
                return true;
            }
            return false;
        },
    };
};
