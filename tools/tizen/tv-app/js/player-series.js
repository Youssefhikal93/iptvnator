// Extras for the player: a button row after play/pause (Start over, Audio &
// subtitles, Episodes for shows, and the settings gear on the right), Skip
// intro floating above the bar during an episode's intro, an Up next card that plays the next episode when one ends, and an
// episodes panel with season pills.
//
// A request opts in with `episodes: { items, index, open(i) }` (built by the
// browser); open(i) returns the request for episode i. Xtream has no intro
// markers: Skip intro appears only once the viewer has skipped an intro by
// hand. A forward jump of 20 s or more that starts in an episode's first five
// minutes teaches the show's intro (intro-marks.js): it starts where the jump
// began and ends where it landed. The button then shows from 5 s before that
// start, for 7 s, and jumps to the end; a jump soon after it corrects the end.
//
// The focus is on play/pause when the controls appear; ◀ ▶ move along the
// row, ▲ goes to the timeline (where ◀ ▶ seek) and from there to Skip intro.
window.PlayerSeries = function (api) {
    'use strict';

    var LEARN_BEFORE_MS = 300000;
    var LEARN_MIN_MS = 20000;
    var CHAIN_MS = 4000;
    var EARLY_MS = 5000;
    var UP_NEXT_BEFORE_MS = 30000;
    var LEARN_MS = 60000;
    var SKIP_SHOWN_MS = 7000;
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
        return { focus: 'play', introDone: false, learnUntil: 0, skipUntil: 0, controlsOn: false, manual: null, dismissed: false, autoplayAt: 0, panel: null, art: '' };
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

    // Skip intro is on screen for 7 s from when the intro starts, and again for
    // 7 s each time the controls come up during it; focused, it stays.
    function skipShown() {
        if (!inIntro()) return false;
        if (!s.skipUntil) s.skipUntil = Date.now() + SKIP_SHOWN_MS;
        return s.focus === 'skip' || Date.now() < s.skipUntil;
    }

    function showKey() {
        var eps = episodes();
        return eps ? eps.show || '' : '';
    }

    function previousIndex() {
        var eps = episodes();
        return eps && eps.index > 0 ? eps.index - 1 : -1;
    }

    function nextIndex() {
        var eps = episodes();
        return eps && eps.index + 1 < eps.items.length ? eps.index + 1 : -1;
    }

    function inIntro() {
        var mark = IntroMarks.get(showKey());
        if (!mark || !episodes() || s.introDone || api.isEnded()) return false;
        var pos = api.position();
        return pos >= Math.max(0, mark.from - EARLY_MS) && pos < mark.to;
    }

    function buttons() {
        var req = api.current();
        if (!req || req.live) return [];
        var list = [];
        list.push({ id: 'play', play: true, run: function () { api.togglePause(); } });
        if (previousIndex() >= 0) list.push({ id: 'previous', label: I18n.t('player.previous'), icon: 'previous', run: function () { playEpisode(previousIndex()); } });
        if (nextIndex() >= 0) list.push({ id: 'next', label: I18n.t('player.next'), icon: 'next', run: playNext });
        list.push({ id: 'startOver', label: I18n.t('detail.startOver'), icon: 'restart', run: startOver });
        list.push({ id: 'tracks', label: I18n.t('player.hint.audioSubs'), icon: 'subs', run: function () { api.openMenu('tracks'); } });
        if (episodes()) list.push({ id: 'episodes', label: I18n.t('player.episodes'), icon: 'episodes', run: openPanel });
        list.push({ id: 'gear', label: I18n.t('rail.settings'), icon: 'gear', gear: true, run: function () { api.openMenu('settings'); } });
        return list;
    }

    // To the end of the show's learnt intro.
    function skipIntro() {
        var mark = IntroMarks.get(showKey());
        if (!mark) return;
        s.introDone = true;
        s.learnUntil = Date.now() + LEARN_MS;
        api.seekTo(mark.to);
        api.showControls();
    }

    // Every committed jump (from where it started to where it landed). Soon
    // after Skip intro it corrects the end; otherwise quick forward jumps in a
    // row count as one, and one of 20 s or more that began in the first five
    // minutes teaches the intro. The latest such jump wins.
    function onJump(from, to) {
        var show = showKey();
        if (!show) return;
        var now = Date.now();
        var mark = IntroMarks.get(show);
        if (s.learnUntil && now <= s.learnUntil && mark) {
            if (to > mark.from) IntroMarks.set(show, mark.from, to);
            s.learnUntil = now + LEARN_MS;
            return;
        }
        if (!(to > from)) {
            s.manual = null;
            return;
        }
        var chained = s.manual && now - s.manual.at <= CHAIN_MS && Math.abs(from - s.manual.to) <= 3000;
        s.manual = chained ? { from: s.manual.from, to: to, at: now } : { from: from, to: to, at: now };
        if (s.manual.to - s.manual.from >= LEARN_MIN_MS && s.manual.from <= LEARN_BEFORE_MS) {
            IntroMarks.set(show, s.manual.from, s.manual.to);
        }
    }

    // The Intro group of the ▲ menu, once the show has a learnt intro.
    function introEntries(head, item) {
        var mark = IntroMarks.get(showKey());
        if (!mark) return;
        head(I18n.t('player.intro'), I18n.t('player.introRange', { from: api.clock(mark.from), to: api.clock(mark.to) }));
        item(I18n.t('player.introForget'), false, function () {
            IntroMarks.clear(showKey());
            api.toast(I18n.t('player.introForgotten'));
        });
    }

    function startOver() {
        api.seekTo(0);
        api.showControls();
    }

    function playEpisode(index) {
        var eps = episodes();
        reset();
        var req = eps.open(index);
        req.openKind = 'next'; // opened from the player, for the open's timing line (#70)
        api.play(req);
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
        // Skip intro left the screen while focused: back to the timeline.
        if (s.focus === 'skip' && !skipShown()) s.focus = 'bar';
        if (s.focus !== 'bar' && s.focus !== 'skip' && !list.some(function (button) { return button.id === s.focus; })) s.focus = 'play';
        ui.buttons.textContent = '';
        list.forEach(function (button) {
            // Play/pause is the circle before the row.
            if (button.play) return;
            var node = el('span', 'pl-btn' + (button.gear ? ' pl-gear' : '') + (button.id === s.focus ? ' focus' : ''));
            if (button.icon) node.appendChild(el('span', 'pl-icon pl-icon-' + button.icon));
            // The gear shows only its icon; its name is for screen readers.
            if (button.gear) node.setAttribute('aria-label', button.label);
            else node.appendChild(document.createTextNode(button.label));
            ui.buttons.appendChild(node);
        });
    }

    // Keys on the timeline and Skip intro; false leaves the key to the player
    // (◀ ▶ seek, OK confirms or pauses, ▲ opens the menu).
    function barKey(code) {
        if (s.focus === 'skip') {
            if (code === KEY.ENTER) {
                s.focus = 'bar';
                skipIntro();
            } else if (code === KEY.DOWN || Keys.isBack(code)) s.focus = 'bar';
            else if (code !== KEY.UP && code !== KEY.LEFT && code !== KEY.RIGHT) return false;
            api.showControls();
            return true;
        }
        if (code === KEY.DOWN) s.focus = 'play';
        else if (code === KEY.UP && skipShown()) s.focus = 'skip';
        else return false;
        api.showControls();
        return true;
    }

    function buttonsKey(code) {
        var list = buttons();
        var at = Math.max(0, list.map(function (button) { return button.id; }).indexOf(s.focus));
        if (code === KEY.LEFT && at > 0) s.focus = list[at - 1].id;
        else if (code === KEY.RIGHT && at < list.length - 1) s.focus = list[at + 1].id;
        else if (code === KEY.UP) s.focus = 'bar';
        else if (code === KEY.ENTER) list[at].run();
        else if (code !== KEY.LEFT && code !== KEY.RIGHT && code !== KEY.DOWN) return false;
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
        onJump: onJump,
        introEntries: introEntries,
        // Keeps the overlay up while the user is on a button or the panel.
        busy: function () {
            return !!s.panel || (s.focus !== 'play' && s.focus !== 'bar');
        },
        onBar: function () {
            return s.focus === 'bar';
        },
        // Called on every player tick and render.
        render: function (controlsOn) {
            renderButtons();
            if (controlsOn && !s.controlsOn && inIntro()) s.skipUntil = Date.now() + SKIP_SHOWN_MS;
            s.controlsOn = !!controlsOn;
            ui.skip.classList.toggle('hidden', !skipShown());
            ui.skip.classList.toggle('focus', s.focus === 'skip');
            renderUpNext();
        },
        onHide: function () {
            s.focus = 'play';
        },
        // Returns true when the key was consumed.
        key: function (code) {
            var req = api.current();
            if (!req || req.live) return false;
            if (s.panel) return panelKey(code);
            if (upNextShown() && code === KEY.ENTER) return playNext(), true;
            if (upNextShown() && Keys.isBack(code)) {
                s.dismissed = true;
                renderUpNext();
                return true;
            }
            if (s.focus === 'bar' || s.focus === 'skip') return barKey(code);
            return buttonsKey(code);
        },
    };
};
