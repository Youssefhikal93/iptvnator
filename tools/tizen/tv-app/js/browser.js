// The main screen, laid out like IPTVnator on the desktop: a section rail,
// a source pill in the header, a category side list and the content list.
window.Browser = function (hooks) {
    'use strict';

    var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, RETURN: 10009, BACKSPACE: 8, ESCAPE: 27, CH_UP: 427, CH_DOWN: 428, IME_DONE: 65376, IME_CANCEL: 65385 };
    var HOLD_MS = 600;
    // Header toolbar, left to right: search bar, list view, grid view.
    var TOOLS = ['search', 'list', 'grid'];
    var STEPS = { 38: -1, 40: 1, 427: -10, 428: 10 };
    var SECTIONS = [
        { id: 'home', label: 'Home', icon: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z' },
        { id: 'sources', label: 'Sources', icon: 'M3 10h11v2H3zm0-4h11v2H3zm0 8h7v2H3zm13-1v8l6-4z' },
        { id: 'live', label: 'Live TV', icon: 'M21 6h-7.59l3.29-3.29L16 2l-4 4-4-4-.71.71L10.59 6H3c-1.1 0-2 .89-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.11-.9-2-2-2zm0 14H3V8h18v12zM9 10v8l7-4z' },
        { id: 'movies', label: 'Movies', icon: 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z' },
        { id: 'series', label: 'Series', icon: 'M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z' },
    ];
    var $ = function (id) {
        return document.getElementById(id);
    };
    var state = { section: 'sources', zone: 'categories', source: null, adapter: null, info: null, token: 0, timer: null, cache: {}, armed: null, base: null, search: null, showingSearch: false, searching: false, searchTimer: null, tool: 0, toolFrom: 'items', press: null, played: false, favKeys: null, toastTimer: null, updating: 0, added: {}, epg: null, epgWanted: [], epgTimer: null, redrawTimer: null };
    var restoring = false;
    var live = LiveChannels({
        categories: function () {
            var adapter = state.adapter;
            return cached('live:categories', function () { return adapter.categories('live'); });
        },
        channels: function (categoryId) {
            var adapter = state.adapter;
            return cached('live:items:' + categoryId, function () { return adapter.items('live', categoryId); });
        },
        request: liveRequest,
        record: function (channel) {
            record(channel, null, null, 'live');
            Library.setLastChannel(sourceId(), channel);
        },
    });

    var categories = List($('categories'), {
        rows: 11,
        title: function () {
            return state.section === 'sources' ? 'Your sources' : sectionOf(state.section).label + ' categories';
        },
        label: function (row) {
            return row.category_name;
        },
        badge: function (row) {
            return row.count;
        },
    });
    var detail = Detail();
    var home = Home({
        hero: function () {
            return state.adapter ? continueEntries().slice(0, 3) : [];
        },
        rows: function () {
            return state.adapter ? homeRows() : [];
        },
        open: function (entry) {
            openEntry(entry.item, entry.section);
        },
        resume: function (entry) {
            if (entry.item.episode) playSavedEpisode(entry.item, true);
            else playMovie(entry.item, true);
        },
        openDetails: function (entry) {
            if (entry.item.episode) openShow(entry.item.show);
            else openMovie(entry.item);
        },
        details: homeDetails,
        progress: progressOf,
        programme: function (item) {
            if (!state.epg || item.stream_id === undefined) return null;
            var programmes = state.epg.peek(item);
            if (programmes === undefined) return wantProgramme(item), null;
            return programmes.now;
        },
    });
    var items = List($('items'), {
        rows: 9,
        title: function () {
            if (state.section === 'sources') return 'Source';
            if (state.showingSearch) return 'Search: "' + state.search.query + '"';
            var category = categories.item();
            return category ? category.category_name : '';
        },
        decorate: decorate,
        label: itemLabel,
        icon: function (it) {
            return it.stream_icon || it.cover || it.logo || null;
        },
    });

    function itemLabel(it) {
        if (it.label) return it.label;
        return (it.num && state.section === 'live' ? it.num + '. ' : '') + it.name;
    }

    // ---- Library: favorites, recently watched, continue watching ----

    function sourceId() {
        return state.source.id;
    }

    function favoriteTarget(item) {
        return item.episode ? item.show : item;
    }

    // section: the item's own section (Home mixes them); the open one by default.
    function isFavorite(item, section) {
        section = section || state.section;
        state.favKeys = state.favKeys || {};
        var keys = state.favKeys[section];
        if (!keys) {
            keys = state.favKeys[section] = {};
            Library.favorites(sourceId(), section).forEach(function (entry) {
                keys[Library.keyOf(section, entry)] = true;
            });
        }
        return !!keys[Library.keyOf(section, favoriteTarget(item))];
    }

    // Star for favorites and a thin progress bar for unfinished movies and episodes.
    function decorate(el, item) {
        if (state.section === 'sources' || !state.source) return;
        if (isFavorite(item)) {
            var star = document.createElement('span');
            star.className = 'star';
            star.textContent = '\u2605';
            el.appendChild(star);
        }
        if (state.section === 'live') return showProgramme(el, item);
        var p = Library.progress(Library.progressId(state.section, item));
        if (p && p.ratio < 0.95) {
            var bar = document.createElement('div');
            bar.className = 'bar';
            var fill = document.createElement('div');
            fill.className = 'fill';
            fill.style.width = Math.max(3, Math.round(p.ratio * 100)) + '%';
            bar.appendChild(fill);
            el.appendChild(bar);
        }
    }

    // ---- Now/next on live channels ----

    function liveRequest(channel) {
        var req = state.adapter.liveRequest(channel);
        var epg = state.epg;
        if (epg && channel.stream_id !== undefined) {
            req.programmes = function () {
                return epg.load(channel);
            };
        }
        return req;
    }

    // The current programme under a channel's name, and how far it is.
    function showProgramme(el, item) {
        if (!state.epg || item.stream_id === undefined) return;
        var programmes = state.epg.peek(item);
        if (programmes === undefined) return wantProgramme(item);
        var now = programmes.now;
        if (!now) return;
        var label = el.querySelector('.label');
        var line = document.createElement('div');
        line.className = 'epg-now';
        line.textContent = now.title;
        (label || el).appendChild(line);
        var bar = document.createElement('div');
        bar.className = label ? 'epg-bar' : 'bar';
        var fill = document.createElement('div');
        fill.className = 'fill';
        fill.style.width = Math.round(Math.min(1, (Date.now() - now.start) / (now.end - now.start)) * 100) + '%';
        bar.appendChild(fill);
        (label || el).appendChild(bar);
    }

    // Rows ask while they render; the fetch waits until scrolling stops and
    // only covers the last screenful.
    function wantProgramme(item) {
        state.epgWanted.push(item);
        clearTimeout(state.epgTimer);
        state.epgTimer = setTimeout(function () {
            var epg = state.epg;
            var wanted = state.epgWanted;
            state.epgWanted = [];
            if (!epg) return;
            epg.want(wanted, 12, function () {
                if (epg !== state.epg) return;
                clearTimeout(state.redrawTimer);
                state.redrawTimer = setTimeout(function () {
                    if (state.section === 'live') items.select(items.index());
                    else if (state.section === 'home') home.render();
                }, 150);
            });
        }, 300);
    }

    function virtualRows() {
        if (state.section === 'sources' || !state.source) return [];
        var id = sourceId();
        var section = state.section;
        var rows = [
            { category_id: '__fav', category_name: 'Favorites', virtual: 'favorites', count: Library.favorites(id, section).length },
            { category_id: '__recent', category_name: 'Recently watched', virtual: 'recent', count: Library.recent(id, section).length },
        ];
        if (section !== 'live') {
            rows.push({ category_id: '__continue', category_name: 'Continue watching', virtual: 'continue', count: Library.continueWatching(id, section).length });
        }
        return rows;
    }

    function showCategories(index) {
        categories.set(virtualRows().concat(state.base || []), index, 'No categories');
    }

    function virtualList(kind) {
        var id = sourceId();
        if (kind === 'favorites') return Library.favorites(id, state.section);
        if (kind === 'recent') return Library.recent(id, state.section);
        return Library.continueWatching(id, state.section);
    }

    var EMPTY = {
        favorites: 'No favorites yet. Hold OK on an item to add it.',
        recent: 'Nothing watched yet.',
        continue: 'Nothing to continue.',
    };

    function showVirtual(category, index) {
        state.token++;
        state.showingSearch = false;
        applyView();
        items.set(virtualList(category.virtual), index || 0, EMPTY[category.virtual]);
        renderChrome();
    }

    function record(item, show, episode, section) {
        Library.addRecent(sourceId(), episode ? 'series' : section || state.section, item, show, episode);
        state.played = true;
    }

    // After playback or a favorite change: refresh counts and the open list.
    function refreshLibrary() {
        if (state.section === 'home') {
            state.favKeys = null;
            return home.render();
        }
        if (state.section === 'sources' || !state.adapter || !state.base) return;
        state.favKeys = null;
        showCategories(categories.index());
        var category = categories.item();
        if (category && category.virtual && !state.showingSearch) showVirtual(category, items.index());
        else if (items.items().length) items.select(items.index());
        renderChrome();
    }

    function toast(text) {
        var el = $('toast');
        el.textContent = text;
        el.classList.remove('hidden');
        clearTimeout(state.toastTimer);
        state.toastTimer = setTimeout(function () {
            el.classList.add('hidden');
        }, 1800);
    }

    function toggleFavorite(item, section) {
        section = section || state.section;
        if (!item || section === 'sources') return;
        var target = favoriteTarget(item);
        var added = Library.toggleFavorite(sourceId(), section, target);
        toast((added ? 'Added to Favorites: ' : 'Removed from Favorites: ') + target.name);
        refreshLibrary();
    }

    // Hold OK on an item: play, favorite and library actions, like the
    // desktop's item context menu.
    function openItemMenu(item, section) {
        if (!item) return;
        var options = [
            {
                label: section === 'live' ? 'Watch' : item.episode ? 'Play' : 'Details',
                run: function () {
                    openEntry(item, section);
                },
            },
        ];
        if (section === 'movies' && !item.episode) {
            options.push({
                label: 'Play',
                run: function () {
                    playMovie(item);
                },
            });
        }
        options.push({
            label: isFavorite(item, section) ? 'Remove from Favorites' : 'Add to Favorites',
            run: function () {
                toggleFavorite(item, section);
            },
        });
        var progressId = Library.progressId(section, item);
        var progress = section === 'live' ? null : Library.progress(progressId);
        if (progress) {
            options.push({
                label: progress.ratio < 0.95 ? 'Remove from Continue watching' : 'Mark as not watched',
                run: function () {
                    Library.clearProgress(progressId);
                    toast(progress.ratio < 0.95 ? 'Removed from Continue watching' : 'Marked as not watched');
                    refreshLibrary();
                },
            });
        }
        if (Library.isRecent(sourceId(), section, item)) {
            options.push({
                label: 'Remove from Recently watched',
                run: function () {
                    Library.removeRecent(sourceId(), section, item);
                    toast('Removed from Recently watched');
                    refreshLibrary();
                },
            });
        }
        options.push({ label: 'Cancel' });
        Menu.open(itemLabel(item), options);
    }

    function viewMode() {
        return Library.view(state.section, state.section === 'live' ? 'list' : 'grid');
    }

    function applyView() {
        items.setGrid(state.section !== 'sources' && viewMode() === 'grid');
    }

    function setView(mode) {
        if (state.section === 'sources') return;
        Library.setView(state.section, mode);
        applyView();
        renderChrome();
    }

    // ---- Header toolbar and search ----

    function hasTools() {
        return state.section !== 'sources' && !!state.base;
    }

    function enterToolbar(from) {
        if (!hasTools()) return false;
        state.toolFrom = from;
        state.tool = 0;
        setZone('toolbar');
        return true;
    }

    function leaveToolbar() {
        var back = state.toolFrom === 'items' && items.items().length ? 'items' : 'categories';
        setZone(back);
    }

    function startTyping() {
        state.searching = true;
        $('searchbar').classList.add('typing');
        $('search-input').focus();
    }

    function stopTyping() {
        state.searching = false;
        $('searchbar').classList.remove('typing');
        $('search-input').blur();
    }

    // Filters the section's full catalogue; an empty query restores the category.
    function runSearch() {
        clearTimeout(state.searchTimer);
        var query = $('search-input').value.trim();
        var section = state.section;
        if (!query) {
            if (state.showingSearch) loadItems();
            return Promise.resolve(0);
        }
        var needle = query.toLowerCase();
        var token = ++state.token;
        state.search = { section: section, query: query, results: [] };
        state.showingSearch = true;
        applyView();
        items.set([], 0, 'Searching\u2026');
        return cached(section + ':items:', function () {
            return state.adapter.items(section, '');
        })
            .then(function (all) {
                if (token !== state.token) return 0;
                state.search.results = all.filter(function (it) {
                    return String(it.name).toLowerCase().indexOf(needle) !== -1;
                });
                items.set(state.search.results, 0, 'No results for "' + query + '"');
                renderChrome();
                return state.search.results.length;
            })
            .catch(function (err) {
                fail(items, 'SEARCH')(err);
                return 0;
            });
    }

    // Results follow the typing after a short pause.
    $('search-input').addEventListener('input', function () {
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(runSearch, 500);
    });

    function onSearchKey(code) {
        if (code === KEY.ENTER || code === KEY.IME_DONE || code === KEY.DOWN) {
            stopTyping();
            runSearch().then(function (found) {
                if (found) setZone('items');
            });
        } else if (code === KEY.RETURN || code === KEY.ESCAPE || code === KEY.IME_CANCEL) {
            stopTyping();
        } else return false;
        return true;
    }

    function onToolbarKey(code) {
        var tool = TOOLS[state.tool];
        if (code === KEY.LEFT && state.tool > 0) state.tool--;
        else if (code === KEY.RIGHT && state.tool < TOOLS.length - 1) state.tool++;
        else if (code === KEY.LEFT) setZone('rail');
        else if (code === KEY.DOWN || isBack(code)) leaveToolbar();
        else if (code === KEY.ENTER && tool === 'search') startTyping();
        else if (code === KEY.ENTER) setView(tool);
        else return code === KEY.UP || code === KEY.RIGHT;
        renderChrome();
        return true;
    }

    function sectionOf(id) {
        return SECTIONS.filter(function (s) {
            return s.id === id;
        })[0];
    }

    function available(id) {
        if (id === 'home') return !!state.adapter;
        return id === 'sources' || (state.adapter && state.adapter.sections.indexOf(id) !== -1);
    }

    function isBack(code) {
        return code === KEY.RETURN || code === KEY.BACKSPACE || code === KEY.ESCAPE;
    }

    // Memory, then the saved catalogue, then the provider. A saved list is
    // returned at once and refreshed in the background (once per session);
    // onFresh(list) swaps in the new list when it changed.
    function cached(key, load, onFresh) {
        if (state.cache[key]) return Promise.resolve(state.cache[key]);
        var id = sourceId();
        return Catalogue.get(id, key).then(function (saved) {
            if (saved === undefined || id !== sourceId()) return loadFresh(id, key, load);
            state.cache[key] = saved;
            refreshSaved(id, key, load, saved, onFresh);
            return saved;
        });
    }

    function loadFresh(id, key, load) {
        return load().then(function (value) {
            if (state.source && id === sourceId()) state.cache[key] = value;
            Catalogue.put(id, key, value);
            return value;
        });
    }

    function refreshSaved(id, key, load, saved, onFresh) {
        state.updating++;
        renderChrome();
        load()
            .then(function (value) {
                Catalogue.put(id, key, value);
                if (!state.source || id !== sourceId()) return;
                state.cache[key] = value;
                if (onFresh && JSON.stringify(value) !== JSON.stringify(saved)) onFresh(value);
            })
            .catch(function (err) {
                Log.error('REFRESH FAIL ' + key + ' ' + err.message);
            })
            .then(function () {
                state.updating--;
                renderChrome();
            });
    }

    // Position of `item` in a refreshed list, matched by provider id.
    function indexIn(list, item, fallback) {
        var id = item && (item.stream_id || item.series_id || item.category_id || item.id || item.url);
        for (var i = 0; id !== undefined && i < list.length; i++) {
            var other = list[i];
            if ((other.stream_id || other.series_id || other.category_id || other.id || other.url) === id) return i;
        }
        return fallback;
    }

    function renderChrome() {
        $('rail').innerHTML = '';
        SECTIONS.forEach(function (section) {
            var el = document.createElement('div');
            el.className =
                'rail-item' +
                (section.id === state.section ? ' active' : '') +
                (section.id === state.section && state.zone === 'rail' ? ' focused' : '') +
                (available(section.id) ? '' : ' disabled');
            el.innerHTML =
                '<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="' + section.icon + '"/></svg><span></span>';
            el.lastChild.textContent = section.label;
            $('rail').appendChild(el);
        });
        $('source-name').textContent = state.source ? state.source.name : 'No source yet';
        $('source-type').textContent = state.source ? Sources.typeLabel(state.source) + (state.updating ? ' · Updating…' : '') : 'Add one in Sources';
        renderToolbar();
        $('hints').textContent =
            state.zone === 'home'
                ? 'OK: open · Hold OK: options · Arrows: move · Return: menu'
                : state.zone === 'items' && state.section !== 'sources'
                ? 'OK: open \u00b7 Hold OK: options \u00b7 \u25b2 at the top: search and view \u00b7 Return: back'
                : 'Arrows: move \u00b7 OK: open \u00b7 CH \u25b2\u25bc: page \u00b7 Return: back';
    }

    function renderToolbar() {
        var on = hasTools();
        var focus = state.zone === 'toolbar' ? TOOLS[state.tool] : null;
        $('header').classList.toggle('no-tools', !on);
        $('searchbar').classList.toggle('focused', focus === 'search');
        var input = $('search-input');
        input.placeholder = on ? 'Search ' + sectionOf(state.section).label + '\u2026' : 'Search';
        if (!state.searching) input.value = state.showingSearch ? state.search.query : '';
        Array.prototype.forEach.call(document.querySelectorAll('.view-btn'), function (btn) {
            var mode = btn.getAttribute('data-mode');
            btn.classList.toggle('active', on && viewMode() === mode);
            btn.classList.toggle('focused', focus === mode);
        });
    }

    // Where the focus goes from the rail: Home's rows or the category list.
    function contentZone() {
        return state.section === 'home' ? 'home' : 'categories';
    }

    function setZone(zone) {
        state.zone = zone;
        categories.setActive(zone === 'categories');
        items.setActive(zone === 'items');
        home.setActive(zone === 'home');
        renderChrome();
    }

    function fail(list, label) {
        return function (err) {
            Log.error(label + ' FAIL ' + err.message);
            list.set([], 0, 'Could not load: ' + err.message);
        };
    }

    // ---- Sources section ----

    function sourceRows() {
        var current = state.source && state.source.id;
        return Sources.all()
            .map(function (s) {
                return { category_name: s.name, count: s.id === current ? 'Active' : s.type === 'xtream' ? 'Xtream' : 'M3U', source: s };
            })
            .concat([
                { category_name: '+  Add Xtream account', action: 'xtream' },
                { category_name: '+  Add M3U playlist', action: 'm3u' },
            ]);
    }

    function infoRows() {
        var info = state.info;
        if (!info) return [];
        if (info.channels !== undefined) return [{ label: info.channels + ' channels in ' + info.groups + ' groups' }];
        var expires = info.exp_date ? new Date(Number(info.exp_date) * 1000).toLocaleDateString() : 'unknown';
        return [
            { label: 'Status: ' + (info.status || 'unknown') },
            { label: 'Expires: ' + expires },
            { label: 'Connections: ' + (info.active_cons || 0) + ' / ' + (info.max_connections || '?') },
        ];
    }

    function showSourceDetails() {
        var row = categories.item();
        state.armed = null;
        if (!row || !row.source) {
            items.set([], 0, row ? 'Press OK to add one.' : '');
        } else {
            var isCurrent = state.source && row.source.id === state.source.id;
            var rows = [
                { label: isCurrent ? 'Watch this source' : 'Switch to this source', action: 'open' },
                { label: 'Refresh source', action: 'refresh' },
                { label: 'Remove', action: 'remove' },
                { label: Sources.typeLabel(row.source) + ' · ' + row.source.url },
            ];
            items.set(isCurrent ? rows.concat(infoRows()) : rows, 0);
        }
        renderChrome();
    }

    function showSources(index) {
        categories.set(sourceRows(), index || 0, '');
        showSourceDetails();
    }

    function sourceAction() {
        var row = categories.item();
        var action = items.item() && items.item().action;
        if (action === 'open') {
            setSource(row.source);
            openSection('home');
            setZone(contentZone());
        } else if (action === 'refresh') {
            // Forget the saved lists; the next section opened reloads them.
            Catalogue.drop(row.source.id).then(function () {
                toast('Reloading ' + row.source.name + '…');
                setSource(row.source);
                openSection('home');
                setZone(contentZone());
            });
        } else if (action === 'remove') {
            if (state.armed !== row.source.id) {
                state.armed = row.source.id;
                items.items()[items.index()].label = 'Press OK again to remove';
                items.select(items.index());
                return;
            }
            Sources.remove(row.source.id);
            Catalogue.drop(row.source.id);
            if (state.source && state.source.id === row.source.id) setSource(Sources.current());
            showSources(0);
            setZone('categories');
        }
    }

    function addSource(kind) {
        hooks.openForm(kind, function (source) {
            if (!source) return setZone('categories');
            setSource(Sources.add(source));
            openSection('home');
            setZone(contentZone());
        });
    }

    // ---- Content sections ----

    function setSource(source) {
        live.reset();
        restoring = false;
        state.source = source;
        state.adapter = null;
        state.epg = null;
        state.info = null;
        state.cache = {};
        state.base = null;
        state.search = null;
        state.showingSearch = false;
        state.favKeys = null;
        state.added = {};
        home.reset();
        if (!source) return renderChrome();
        Sources.setCurrent(source.id);
        state.adapter = source.type === 'xtream' ? XtreamSource(source) : M3uSource(source);
        state.epg = state.adapter.nowNext ? Epg(state.adapter) : null;
        var adapter = state.adapter;
        adapter
            .account()
            .then(function (info) {
                if (adapter !== state.adapter) return;
                state.info = info;
                if (state.section === 'sources') showSourceDetails();
            })
            .catch(function (err) {
                Log.error('SOURCE CHECK FAIL ' + err.message);
            });
        renderChrome();
    }

    function openSection(id) {
        if (!available(id)) return;
        state.section = id;
        $('content').classList.toggle('home', id === 'home');
        state.showingSearch = false;
        state.base = null;
        state.favKeys = null;
        var token = ++state.token;
        applyView();
        items.set([], 0, '');
        if (id === 'sources') return showSources(0);
        if (id === 'home') return showHome();
        categories.set([], 0, 'Loading…');
        renderChrome();
        cached(
            id + ':categories',
            function () {
                return state.adapter.categories(id);
            },
            function (list) {
                if (state.section !== id || !state.base) return;
                state.base = list;
                showCategories(indexIn(virtualRows().concat(list), categories.item(), categories.index()));
            }
        )
            .then(function (list) {
                if (token !== state.token) return;
                state.base = list;
                showCategories(virtualRows().length);
                loadItems();
            })
            .catch(fail(categories, 'CATEGORIES'));
    }

    function loadItems() {
        var category = categories.item();
        if (!category || state.section === 'sources') return;
        if (category.virtual) return showVirtual(category);
        var section = state.section;
        var token = ++state.token;
        state.showingSearch = false;
        applyView();
        items.set([], 0, 'Loading…');
        renderChrome();
        cached(
            section + ':items:' + category.category_id,
            function () {
                return state.adapter.items(section, category.category_id);
            },
            function (list) {
                if (token === state.token) items.set(list, indexIn(list, items.item(), items.index()), 'Empty category');
            }
        )
            .then(function (list) {
                if (token === state.token) items.set(list, 0, 'Empty category');
            })
            .catch(fail(items, 'ITEMS'));
    }

    // An episode request that knows the whole show, so the player can offer
    // Next episode, autoplay and the episodes panel. Opening another episode
    // from the player records it like a pick from the list.
    function episodeRequest(show, list, index) {
        var req = state.adapter.episodeRequest(show, list[index]);
        req.episodes = {
            items: list,
            index: index,
            open: function (next) {
                record(list[next], show, list[next]);
                return episodeRequest(show, list, next);
            },
        };
        return req;
    }

    // From Recently watched / Continue watching: load the show's episodes
    // first so Next episode works there too.
    // resume: true / false skips the player's Resume prompt.
    function playSavedEpisode(entry, resume) {
        var show = entry.show;
        record(entry, show, entry.episode);
        var play = function (req) {
            if (resume !== undefined) req.resume = resume;
            hooks.play(req);
        };
        loadShow(show)
            .then(function (info) {
                var list = info.episodes;
                var index = -1;
                list.forEach(function (ep, i) {
                    if (String(ep.id) === String(entry.episode.id)) index = i;
                });
                play(index >= 0 ? episodeRequest(show, list, index) : state.adapter.episodeRequest(show, entry.episode));
            })
            .catch(function (err) {
                Log.error('EPISODES FAIL ' + err.message);
                play(state.adapter.episodeRequest(show, entry.episode));
            });
    }

    // ---- Home ----

    var HOME_ROW_MAX = 20;

    function entriesOf(section, list) {
        return list.slice(0, HOME_ROW_MAX).map(function (item) {
            return { item: item, section: section };
        });
    }

    function progressOf(entry) {
        return Library.progress(Library.progressId(entry.section, entry.item));
    }

    // Unfinished movies, and each show's latest episode while it is
    // unfinished (older episodes never come back); most recent first.
    function continueEntries() {
        var id = sourceId();
        var list = available('movies') ? entriesOf('movies', Library.continueWatching(id, 'movies')) : [];
        if (available('series')) {
            var seen = {};
            Library.recent(id, 'series').forEach(function (item) {
                var show = item.show ? item.show.series_id : item.series_id;
                if (seen[show]) return;
                seen[show] = true;
                if (item.episode && Library.unfinished('series', item)) list.push({ item: item, section: 'series' });
            });
        }
        return list.sort(function (a, b) {
            return progressOf(b).updatedAt - progressOf(a).updatedAt;
        });
    }

    function homeRows() {
        var id = sourceId();
        return [
            { id: 'continue', title: 'Continue watching', entries: continueEntries().slice(0, HOME_ROW_MAX) },
            { id: 'live', title: 'Live now on your favorite channels', entries: entriesOf('live', Library.favorites(id, 'live')) },
            { id: 'fav-movies', title: 'Favorite movies', entries: entriesOf('movies', Library.favorites(id, 'movies')) },
            { id: 'fav-series', title: 'Favorite series', entries: entriesOf('series', Library.favorites(id, 'series')) },
            { id: 'new-movies', title: 'Recently added movies', entries: entriesOf('movies', state.added.movies || []) },
            { id: 'new-series', title: 'Recently added series', entries: entriesOf('series', state.added.series || []) },
            { id: 'recent-live', title: 'Recently watched channels', entries: entriesOf('live', Library.recent(id, 'live')) },
        ];
    }

    // Artwork and plot for the hero.
    function homeDetails(entry) {
        if (entry.item.episode) {
            return loadShow(entry.item.show).then(function (info) {
                return info.details;
            });
        }
        if (!state.adapter.movieInfo) return Promise.resolve({});
        return remembered('vod:' + entry.item.stream_id, function () {
            return state.adapter.movieInfo(entry.item);
        });
    }

    // Newest movies by `added` and shows by `last_modified`, from the
    // section's full list (saved like the other lists).
    function loadRecentlyAdded() {
        [
            ['movies', 'added'],
            ['series', 'last_modified'],
        ].forEach(function (pair) {
            var section = pair[0];
            var field = pair[1];
            var adapter = state.adapter;
            if (!available(section) || state.added[section]) return;
            state.added[section] = [];
            cached(section + ':items:', function () {
                return adapter.items(section, '');
            })
                .then(function (list) {
                    if (adapter !== state.adapter) return;
                    state.added[section] = list
                        .filter(function (it) {
                            return Number(it[field]) > 0;
                        })
                        .sort(function (a, b) {
                            return Number(b[field]) - Number(a[field]);
                        })
                        .slice(0, HOME_ROW_MAX);
                    if (state.section === 'home') home.render();
                })
                .catch(function (err) {
                    Log.error('RECENTLY ADDED FAIL ' + err.message);
                });
        });
    }

    function showHome() {
        home.render();
        renderChrome();
        loadRecentlyAdded();
    }

    // ---- Detail pages ----

    function clock(secs) {
        var h = Math.floor(secs / 3600);
        var m = Math.floor((secs % 3600) / 60);
        var sec = Math.floor(secs % 60);
        return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + sec).slice(-2);
    }

    // Details are kept for the session only; they are cheap to fetch again.
    function remembered(key, load) {
        if (!state.cache[key]) state.cache[key] = load();
        return state.cache[key];
    }

    // resume: true / false skips the player's Resume prompt.
    function playMovie(movie, resume) {
        record(movie, null, null, 'movies');
        var req = state.adapter.movieRequest(movie);
        if (resume !== undefined) req.resume = resume;
        hooks.play(req);
    }

    function openMovie(movie) {
        detail.open({
            item: movie,
            load: function () {
                if (!state.adapter.movieInfo) return Promise.resolve(null);
                return remembered('vod:' + movie.stream_id, function () {
                    return state.adapter.movieInfo(movie);
                });
            },
            actions: function () {
                var p = Library.unfinished('movies', movie);
                var list = p
                    ? [
                          { label: '▶  Resume from ' + clock(p.position), progress: p.ratio, run: playMovie.bind(null, movie, true) },
                          { label: 'Start over', run: playMovie.bind(null, movie, false) },
                      ]
                    : [{ label: '▶  Play', run: playMovie.bind(null, movie, undefined) }];
                list.push({
                    label: isFavorite(movie, 'movies') ? 'Remove from Favorites' : 'Add to Favorites',
                    run: function () {
                        toggleFavorite(movie, 'movies');
                        detail.refresh();
                    },
                });
                return list;
            },
        });
    }

    // A show's details and episodes in one request, saved like the lists so
    // new episodes show up after the background refresh.
    function loadShow(show, onFresh) {
        return cached(
            'series:' + show.series_id,
            function () {
                return state.adapter.seriesInfo(show);
            },
            onFresh
        );
    }

    function playEpisode(show, list, index, resume) {
        record(list[index], show, list[index]);
        var req = episodeRequest(show, list, index);
        if (resume !== undefined) req.resume = resume;
        hooks.play(req);
    }

    function openShow(show) {
        var episodes = DetailEpisodes({
            progressOf: function (ep) {
                return Library.progress('episode:' + ep.id);
            },
            play: function (list, index, resume) {
                playEpisode(show, list, index, resume);
            },
        });
        detail.open({
            item: show,
            episodes: episodes,
            load: function () {
                var fresh = function (info) {
                    episodes.setEpisodes(info.episodes);
                    detail.refresh();
                };
                return loadShow(show, fresh).then(function (info) {
                    episodes.setEpisodes(info.episodes);
                    return info.details;
                });
            },
            actions: function () {
                var next = episodes.nextUp();
                var list = [];
                if (next) {
                    list.push({
                        label: '▶  ' + next.label,
                        progress: next.progress,
                        run: function () {
                            playEpisode(show, episodes.all(), next.index, next.resume);
                        },
                    });
                }
                list.push({
                    label: isFavorite(show, 'series') ? 'Remove from Favorites' : 'Add to Favorites',
                    run: function () {
                        toggleFavorite(show, 'series');
                        detail.refresh();
                    },
                });
                return list;
            },
        });
    }

    // OK on a channel, movie, show or saved episode of `section`.
    function openEntry(item, section) {
        if (item.episode) return playSavedEpisode(item);
        if (section === 'live') {
            return hooks.play(live.play(item, state.section === 'live' ? items.items() : null));
        }
        if (section === 'movies') return openMovie(item);
        openShow(item);
    }

    function activateItem() {
        var item = items.item();
        if (!item) return;
        if (state.section === 'sources') return sourceAction();
        openEntry(item, state.section);
    }

    // ---- Keys ----

    function moveSection(delta) {
        var index = SECTIONS.indexOf(sectionOf(state.section));
        for (var i = index + delta; i >= 0 && i < SECTIONS.length; i += delta) {
            if (available(SECTIONS[i].id)) {
                openSection(SECTIONS[i].id);
                return setZone('rail');
            }
        }
    }

    function onCategoryMoved() {
        if (state.section === 'sources') return showSourceDetails();
        clearTimeout(state.timer);
        state.timer = setTimeout(loadItems, 350);
        renderChrome();
    }

    // Moves the focus in the items list; returns whether it moved.
    function moveItems(code) {
        var cols = items.cols();
        var count = items.items().length;
        var at = items.index();
        if (cols === 1) return items.move(STEPS[code]);
        if (code === KEY.UP) return at >= cols && items.move(-cols);
        if (code === KEY.CH_UP) return items.move(-items.pageSize());
        if (code === KEY.CH_DOWN) return items.move(items.pageSize());
        var target = at + cols;
        if (target > count - 1) {
            if (Math.floor(at / cols) >= Math.floor((count - 1) / cols)) return false;
            target = count - 1;
        }
        return items.move(target - at);
    }

    // Holding OK opens the options menu; a short press runs tap on release.
    function startPress(tap, hold) {
        var press = { fired: false, tap: tap };
        press.timer = setTimeout(function () {
            press.fired = true;
            hold();
        }, HOLD_MS);
        state.press = press;
    }

    function onHomeKey(code) {
        var entry = home.focused();
        if (code === KEY.ENTER && entry) {
            startPress(
                function () {
                    openEntry(entry.item, entry.section);
                },
                function () {
                    openItemMenu(entry.item, entry.section);
                }
            );
        } else if (isBack(code) || home.key(code) === 'left') setZone('rail');
        return true;
    }

    function onKey(code) {
        restoring = false;
        // OK repeats while held; the hold timer and keyup own that press.
        if (state.press && code === KEY.ENTER) return true;
        if (Menu.isOpen()) return Menu.onKey(code);
        if (state.searching) return onSearchKey(code);
        if (detail.isOpen()) return detail.onKey(code);
        if (state.zone === 'toolbar') return onToolbarKey(code);
        if (state.zone === 'home') return onHomeKey(code);
        if (state.zone === 'rail') {
            if (code === KEY.UP || code === KEY.DOWN) moveSection(code === KEY.UP ? -1 : 1);
            else if (code === KEY.RIGHT || code === KEY.ENTER) setZone(contentZone());
            else if (isBack(code)) hooks.exit();
            else return false;
        } else if (state.zone === 'categories') {
            var row = categories.item();
            if (STEPS[code]) {
                if (categories.move(STEPS[code])) onCategoryMoved();
                else if (code === KEY.UP) enterToolbar('categories');
            } else if (code === KEY.LEFT || isBack(code)) setZone('rail');
            else if (code === KEY.ENTER && row && row.action) addSource(row.action);
            else if ((code === KEY.RIGHT || code === KEY.ENTER) && items.items().length) setZone('items');
            else return code === KEY.RIGHT || code === KEY.ENTER;
        } else {
            var grid = items.cols() > 1;
            if (STEPS[code]) {
                if (!moveItems(code) && code === KEY.UP) enterToolbar('items');
            } else if (grid && code === KEY.RIGHT) items.move(1);
            else if (grid && code === KEY.LEFT && items.index() % items.cols() !== 0) items.move(-1);
            else if (code === KEY.ENTER) {
                // Holding OK opens the options menu; a short press opens on release.
                if (state.section === 'sources') activateItem();
                else {
                    startPress(activateItem, function () {
                        openItemMenu(items.item(), state.section);
                    });
                }
            } else if (code === KEY.LEFT || isBack(code)) setZone('categories');
            else return false;
        }
        return true;
    }

    document.addEventListener('keyup', function (event) {
        var press = state.press;
        if (!press || event.keyCode !== KEY.ENTER) return;
        clearTimeout(press.timer);
        state.press = null;
        if (!press.fired) press.tap();
    });

    function start() {
        var source = Sources.current();
        setSource(source);
        if (source) openSection('home');
        else openSection('sources');
        setZone(contentZone());
        if (source) {
            restoring = true;
            live.last(source.id).then(function (channel) {
                if (restoring && channel) hooks.play(live.play(channel));
                restoring = false;
            }).catch(function () {
                restoring = false;
                Log.error('LAST CHANNEL FAIL');
            });
        }
    }

    return {
        start: start,
        onKey: onKey,
        // The player closed: new progress, recents and Resume labels.
        afterPlayback: function () {
            if (!state.played) return;
            state.played = false;
            refreshLibrary();
            // Zapping does not move the list; land on the channel watched last.
            var at = state.section === 'live' && !state.showingSearch ? live.indexOf(items.items(), live.current()) : -1;
            if (at >= 0) items.select(at);
            detail.refresh();
        },
        live: live,
        epg: function () { return state.epg; },
        zap: live.zap,
    };
};
