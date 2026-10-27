// Home: a hero for what you were watching and rows of posters (continue
// watching, favorites, recently added). It only draws and moves the focus;
// the browser supplies the data and opens items.
//
// api: hero() / rows() -> entries { item, section } and [{ id, title, entries }]
//      open(entry) (OK on a poster), resume(entry) and openDetails(entry)
//      (hero buttons), details(entry) -> Promise of detail-page details,
//      progress(entry) -> Progress.of shape or null, watched(entry) -> boolean,
//      isNew(entry) -> whether a show has new episodes since it was watched,
//      programme(item) -> the programme on now for a channel, or null
window.Home = function (api) {
    'use strict';

    var KEY = Keys;
    var root = document.getElementById('home');
    Prefs.onChange(function (name) {
        if (name === 'homeLayout' || name === 'programmeGuide' || name === 'density') render();
    });
    var s = { block: 0, hero: 0, button: 0, rows: {}, details: {} };

    function el(tag, cls, text) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function img(cls, src) {
        var node = el('img', cls);
        node.onerror = function () {
            node.style.visibility = 'hidden';
        };
        if (src) node.src = src;
        else node.style.visibility = 'hidden';
        return node;
    }

    // Host and file name only: enough to tell which logo server fails.
    function logoHost(src) {
        try {
            var u = new URL(src);
            return u.host + ' ' + u.pathname.split('/').pop();
        } catch (e) {
            return '?';
        }
    }

    function art(item) {
        var show = item.show || item;
        return show.stream_icon || show.cover || show.logo || '';
    }

    function titleOf(entry) {
        return entry.item.show ? entry.item.show.name : entry.item.name;
    }

    function episodeOf(entry) {
        var ep = entry.item.episode;
        return ep ? String(ep.label || '').replace(/\s+/g, ' ').trim() : '';
    }

    // Blocks top to bottom: the hero (when there is history), then rows.
    function blocks() {
        var list = [];
        var hero = api.hero();
        if (hero.length) list.push({ hero: hero });
        api.rows().forEach(function (row) {
            if (row.entries.length || row.loading) list.push({ row: row });
        });
        return list;
    }

    function rowState(row) {
        if (!s.rows[row.id]) s.rows[row.id] = { focus: 0, offset: 0 };
        var r = s.rows[row.id];
        var visible = AppearanceLayout.count('--home-cols');
        r.focus = Math.min(r.focus, row.entries.length - 1);
        if (r.focus < r.offset) r.offset = r.focus;
        if (r.focus >= r.offset + visible) r.offset = r.focus - visible + 1;
        return r;
    }

    // ---- Hero -------------------------------------------------------------

    function entryKey(entry) {
        var item = entry.item.show || entry.item;
        return entry.section + ':' + (item.series_id || item.stream_id);
    }

    // The hero keeps showing the same title when the list reorders (after
    // playback the title just watched moves first).
    function heroIndex(hero) {
        for (var i = 0; i < hero.length; i++) {
            if (entryKey(hero[i]) === s.heroKey) return (s.hero = i);
        }
        s.hero = Math.min(s.hero, hero.length - 1);
        s.heroKey = entryKey(hero[s.hero]);
        return s.hero;
    }

    function heroButtons(hero) {
        var list = [
            { label: I18n.t('home.continueButton'), run: 'open' },
            { label: I18n.t('menu.details'), run: 'details' },
        ];
        if (hero.length > 1) list.push({ label: '‹', run: 'prev', small: true }, { label: '›', run: 'next', small: true });
        return list;
    }

    function heroDetails(entry) {
        var key = entry.section + ':' + (entry.item.series_id || entry.item.stream_id);
        if (!s.details[key]) {
            s.details[key] = { value: null };
            api.details(entry)
                .then(function (d) {
                    s.details[key].value = d;
                    render();
                })
                .catch(function () {});
        }
        return s.details[key].value || {};
    }

    function renderHero(hero, focused) {
        var entry = hero[heroIndex(hero)];
        var d = heroDetails(entry);
        var box = el('div', 'hm-hero');
        box.appendChild(img('hm-hero-art', d.backdrop || d.poster || art(entry.item)));
        box.appendChild(el('div', 'hm-hero-shade'));
        var text = el('div', 'hm-hero-text');
        text.appendChild(el('div', 'hm-eyebrow', I18n.t('browser.continueWatching') + (hero.length > 1 ? '  ·  ' + (s.hero + 1) + ' / ' + hero.length : '')));
        text.appendChild(el('div', 'hm-hero-title', titleOf(entry)));
        var sub = episodeOf(entry) || [d.year, d.genre].filter(Boolean).join('  ·  ');
        if (sub) text.appendChild(el('div', 'hm-hero-sub', sub));
        if (d.plot) text.appendChild(el('div', 'hm-hero-plot', d.plot));
        var p = api.progress(entry);
        if (p) {
            var bar = el('div', 'hm-hero-bar');
            var fill = el('div', 'hm-hero-fill');
            fill.style.width = Progress.bar(p.ratio);
            bar.appendChild(fill);
            text.appendChild(bar);
        }
        var row = el('div', 'hm-hero-buttons');
        heroButtons(hero).forEach(function (button, i) {
            var cls = 'dt-btn' + (i === 0 ? ' primary' : '') + (button.small ? ' small' : '') + (focused && i === s.button ? ' focus' : '');
            row.appendChild(el('span', cls, button.label));
        });
        text.appendChild(row);
        box.appendChild(text);
        return box;
    }

    // ---- Rows -------------------------------------------------------------

    function renderCard(entry, focused) {
        var live = entry.section === 'live';
        var card = el('div', 'hm-card' + (live ? ' live' : '') + (focused ? ' focus' : ''));
        var poster = el('div', 'hm-poster');
        var src = art(entry.item);
        var initials = function () { return el('span', 'hm-initials', titleOf(entry).replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()); };
        if (src) {
            // A logo link that fails shows the initials, not an empty tile.
            var logo = img('', src);
            logo.onerror = function () {
                Log.error('Logo failed ' + logoHost(src));
                if (logo.parentNode) logo.parentNode.replaceChild(initials(), logo);
            };
            poster.appendChild(logo);
        } else poster.appendChild(initials());
        LibraryChip(poster, entry.item, Sources.current().id);
        var p = live ? null : api.progress(entry);
        if (api.watched(entry)) {
            var tick = el('span', 'watched-tick', '\u2713');
            tick.setAttribute('aria-label', I18n.t('browser.watched'));
            poster.appendChild(tick);
        }
        if (api.isNew(entry)) poster.appendChild(NewEpisodes.badge());
        if (p && p.status === 'continue') {
            var bar = el('div', 'hm-bar');
            var fill = el('div', 'hm-fill');
            fill.style.width = Progress.bar(p.ratio);
            bar.appendChild(fill);
            poster.appendChild(bar);
        }
        card.appendChild(poster);
        card.appendChild(el('div', 'hm-card-title', titleOf(entry)));
        var sub = live ? (api.programme(entry.item) || {}).title : episodeOf(entry).replace(/^S(\d+) E(\d+)\s.*$/, 'S$1 E$2');
        if (sub) card.appendChild(el('div', 'hm-card-sub', sub));
        return card;
    }

    function renderRow(row, focused) {
        var visible = AppearanceLayout.count('--home-cols');
        var box = el('div', 'hm-row');
        box.appendChild(el('div', 'hm-row-title', row.title));
        var strip = el('div', 'hm-strip');
        if (row.loading) {
            strip.setAttribute('aria-label', I18n.t('common.loading'));
            for (var i = 0; i < visible; i++) {
                var card = el('div', 'hm-card skeleton');
                card.setAttribute('aria-hidden', 'true');
                card.appendChild(el('div', 'hm-poster'));
                strip.appendChild(card);
            }
            box.appendChild(strip);
            return box;
        }
        var r = rowState(row);
        row.entries.slice(r.offset, r.offset + visible).forEach(function (entry, i) {
            strip.appendChild(renderCard(entry, focused && r.offset + i === r.focus));
        });
        box.appendChild(strip);
        return box;
    }

    function render() {
        root.classList.toggle('showcase', Prefs.get('homeLayout') === 'showcase');
        var list = blocks();
        root.textContent = '';
        if (!list.length) {
            var empty = el('div', 'hm-empty', I18n.t('home.nothingHere'));
            empty.appendChild(el('small', '', I18n.t('home.nothingHint')));
            root.appendChild(empty);
            return;
        }
        list.forEach(function (block, index) {
            if ((block.hero ? 'hero' : block.row.id) === s.blockKey) s.block = index;
        });
        s.block = Math.min(s.block, list.length - 1);
        s.blockKey = list[s.block].hero ? 'hero' : list[s.block].row.id;
        // The hero shows while it or the first row has the focus; further
        // down, the focused row moves to the top.
        var first = list[0].hero && s.block <= 1 ? 0 : s.block;
        for (var i = first; i < list.length && i < first + 3; i++) {
            var focused = s.active && i === s.block;
            root.appendChild(list[i].hero ? renderHero(list[i].hero, focused) : renderRow(list[i].row, focused));
        }
        AppearanceLayout.reveal(root);
    }

    // ---- Keys -------------------------------------------------------------

    function heroKey(code, hero) {
        var buttons = heroButtons(hero);
        if (code === KEY.LEFT && s.button === 0) return 'left';
        if (code === KEY.LEFT) s.button--;
        else if (code === KEY.RIGHT && s.button < buttons.length - 1) s.button++;
        else if (code === KEY.ENTER) {
            var run = buttons[s.button].run;
            var at = heroIndex(hero);
            if (run === 'prev' || run === 'next') {
                s.hero = (at + (run === 'prev' ? hero.length - 1 : 1)) % hero.length;
                s.heroKey = entryKey(hero[s.hero]);
            } else if (run === 'details') api.openDetails(hero[at]);
            else api.resume(hero[at]);
        }
        return undefined;
    }

    // Returns 'left' when the focus leaves Home to the rail.
    function key(code) {
        var list = blocks();
        var block = list[s.block];
        if (!block) return code === KEY.LEFT ? 'left' : undefined;
        if (code === KEY.UP && s.block > 0) {
            s.block--;
            s.blockKey = null;
        } else if (code === KEY.DOWN && s.block < list.length - 1) {
            s.block++;
            s.blockKey = null;
        } else if (block.hero) {
            var out = heroKey(code, block.hero);
            render();
            return out;
        } else if (block.row.loading) {
            if (code === KEY.LEFT) return 'left';
        } else {
            var r = rowState(block.row);
            if (code === KEY.LEFT && r.focus === 0) return 'left';
            if (code === KEY.LEFT) r.focus--;
            else if (code === KEY.RIGHT && r.focus < block.row.entries.length - 1) r.focus++;
        }
        render();
        return undefined;
    }

    return {
        render: render,
        key: key,
        setActive: function (active) {
            s.active = active;
            render();
        },
        // The poster entry with the focus (OK and hold-OK act on it), or
        // null on the hero, whose buttons take OK themselves.
        focused: function () {
            var block = blocks()[s.block];
            if (!block || block.hero || block.row.loading) return null;
            return block.row.entries[rowState(block.row).focus];
        },
        // A library pick keeps its row; other source changes start at the top.
        reset: function (fromLibrary) {
            s = { block: 0, blockKey: fromLibrary ? s.blockKey : null, hero: 0, button: 0, rows: {}, details: {}, active: s.active };
        },
    };
};
