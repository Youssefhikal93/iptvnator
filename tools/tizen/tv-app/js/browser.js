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
        { id: 'sources', label: 'Sources', icon: 'M3 10h11v2H3zm0-4h11v2H3zm0 8h7v2H3zm13-1v8l6-4z' },
        { id: 'live', label: 'Live TV', icon: 'M21 6h-7.59l3.29-3.29L16 2l-4 4-4-4-.71.71L10.59 6H3c-1.1 0-2 .89-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.11-.9-2-2-2zm0 14H3V8h18v12zM9 10v8l7-4z' },
        { id: 'movies', label: 'Movies', icon: 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z' },
        { id: 'series', label: 'Series', icon: 'M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z' },
    ];
    var $ = function (id) {
        return document.getElementById(id);
    };
    var state = { section: 'sources', zone: 'categories', source: null, adapter: null, info: null, episodesOf: null, token: 0, timer: null, cache: {}, armed: null, base: null, search: null, showingSearch: false, searching: false, searchTimer: null, tool: 0, toolFrom: 'items', press: null, played: false, favKeys: null, toastTimer: null };

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
    var items = List($('items'), {
        rows: 9,
        title: function () {
            if (state.section === 'sources') return 'Source';
            if (state.episodesOf) return state.episodesOf.name;
            if (state.showingSearch) return 'Search: "' + state.search.query + '"';
            var category = categories.item();
            return category ? category.category_name : '';
        },
        decorate: decorate,
        label: itemLabel,
        pills: function () {
            var show = state.episodesOf;
            if (!show || !show.seasons || show.seasons.length < 2) return null;
            return {
                labels: show.seasons.map(function (season) {
                    return 'Season ' + season;
                }),
                active: show.season,
                focused: state.zone === 'pills',
            };
        },
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

    function isFavorite(item) {
        if (!state.favKeys) {
            state.favKeys = {};
            Library.favorites(sourceId(), state.section).forEach(function (entry) {
                state.favKeys[Library.keyOf(state.section, entry)] = true;
            });
        }
        return !!state.favKeys[Library.keyOf(state.section, favoriteTarget(item))];
    }

    // Star for favorites and a thin progress bar for unfinished movies and episodes.
    function decorate(el, item) {
        if (state.section === 'sources' || !state.source) return;
        if (!state.episodesOf && isFavorite(item)) {
            var star = document.createElement('span');
            star.className = 'star';
            star.textContent = '\u2605';
            el.appendChild(star);
        }
        var id = state.episodesOf ? 'episode:' + item.id : Library.progressId(state.section, item);
        var p = state.section === 'live' ? null : Library.progress(id);
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
        state.episodesOf = null;
        state.showingSearch = false;
        applyView();
        items.set(virtualList(category.virtual), index || 0, EMPTY[category.virtual]);
        renderChrome();
    }

    function record(item, show, episode) {
        Library.addRecent(sourceId(), episode ? 'series' : state.section, item, show, episode);
        state.played = true;
    }

    // After playback or a favorite change: refresh counts and the open list.
    function refreshLibrary() {
        if (state.section === 'sources' || !state.adapter || !state.base) return;
        state.favKeys = null;
        showCategories(categories.index());
        var category = categories.item();
        if (category && category.virtual && !state.showingSearch && !state.episodesOf) showVirtual(category, items.index());
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

    function toggleFavorite() {
        var item = items.item();
        if (!item || state.section === 'sources' || state.episodesOf) return;
        var target = favoriteTarget(item);
        var added = Library.toggleFavorite(sourceId(), state.section, target);
        toast((added ? 'Added to Favorites: ' : 'Removed from Favorites: ') + target.name);
        refreshLibrary();
    }

    // The saved position of a movie or episode, as the player keys it.
    function progressIdOf(item) {
        return state.episodesOf ? 'episode:' + item.id : Library.progressId(state.section, item);
    }

    // Recently watched stores episodes under their show; match that shape.
    function recentEntryOf(item) {
        return state.episodesOf ? { episode: { id: item.id } } : item;
    }

    // Hold OK on an item: play, favorite and library actions, like the
    // desktop's item context menu.
    function openItemMenu() {
        var item = items.item();
        if (!item) return;
        var section = state.section;
        var isShow = section === 'series' && !item.episode && !state.episodesOf;
        var options = [{ label: section === 'live' ? 'Watch' : isShow ? 'Open episodes' : 'Play', run: activateItem }];
        if (!state.episodesOf) {
            options.push({ label: isFavorite(item) ? 'Remove from Favorites' : 'Add to Favorites', run: toggleFavorite });
        }
        var progressId = progressIdOf(item);
        var progress = section === 'live' ? null : Library.progress(progressId);
        if (progress) {
            options.push({
                label: progress.ratio < 0.95 ? 'Remove from Continue watching' : 'Mark as not watched',
                run: function () {
                    Library.clearProgress(progressId);
                    toast('Removed from Continue watching');
                    refreshLibrary();
                },
            });
        }
        if (Library.isRecent(sourceId(), section, recentEntryOf(item))) {
            options.push({
                label: 'Remove from Recently watched',
                run: function () {
                    Library.removeRecent(sourceId(), section, recentEntryOf(item));
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
        items.setGrid(state.section !== 'sources' && !state.episodesOf && viewMode() === 'grid');
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
        state.episodesOf = null;
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
        return id === 'sources' || (state.adapter && state.adapter.sections.indexOf(id) !== -1);
    }

    function isBack(code) {
        return code === KEY.RETURN || code === KEY.BACKSPACE || code === KEY.ESCAPE;
    }

    function cached(key, load) {
        if (state.cache[key]) return Promise.resolve(state.cache[key]);
        return load().then(function (value) {
            state.cache[key] = value;
            return value;
        });
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
        $('source-type').textContent = state.source ? Sources.typeLabel(state.source) : 'Add one in Sources';
        renderToolbar();
        $('hints').textContent =
            state.zone === 'items' && state.section !== 'sources'
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
            btn.classList.toggle('active', on && !state.episodesOf && viewMode() === mode);
            btn.classList.toggle('focused', focus === mode);
        });
    }

    function setZone(zone) {
        state.zone = zone;
        categories.setActive(zone === 'categories');
        items.setActive(zone === 'items');
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
            openSection('live');
            setZone('categories');
        } else if (action === 'remove') {
            if (state.armed !== row.source.id) {
                state.armed = row.source.id;
                items.items()[items.index()].label = 'Press OK again to remove';
                items.select(items.index());
                return;
            }
            Sources.remove(row.source.id);
            if (state.source && state.source.id === row.source.id) setSource(Sources.current());
            showSources(0);
            setZone('categories');
        }
    }

    function addSource(kind) {
        hooks.openForm(kind, function (source) {
            if (!source) return setZone('categories');
            setSource(Sources.add(source));
            openSection('live');
            setZone('categories');
        });
    }

    // ---- Content sections ----

    function setSource(source) {
        state.source = source;
        state.adapter = null;
        state.info = null;
        state.cache = {};
        state.base = null;
        state.search = null;
        state.showingSearch = false;
        state.favKeys = null;
        if (!source) return renderChrome();
        Sources.setCurrent(source.id);
        state.adapter = source.type === 'xtream' ? XtreamSource(source) : M3uSource(source);
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
        state.episodesOf = null;
        state.showingSearch = false;
        state.base = null;
        state.favKeys = null;
        var token = ++state.token;
        applyView();
        items.set([], 0, '');
        if (id === 'sources') return showSources(0);
        categories.set([], 0, 'Loading…');
        renderChrome();
        cached(id + ':categories', function () {
            return state.adapter.categories(id);
        })
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
        state.episodesOf = null;
        state.showingSearch = false;
        applyView();
        items.set([], 0, 'Loading…');
        renderChrome();
        cached(section + ':items:' + category.category_id, function () {
            return state.adapter.items(section, category.category_id);
        })
            .then(function (list) {
                if (token === state.token) items.set(list, 0, 'Empty category');
            })
            .catch(fail(items, 'ITEMS'));
    }

    function openEpisodes(show) {
        var token = ++state.token;
        state.episodesOf = { show: show, name: show.name, list: items.items(), index: items.index() };
        applyView();
        items.set([], 0, 'Loading episodes…');
        cached('episodes:' + show.series_id, function () {
            return state.adapter.episodes(show);
        })
            .then(function (episodes) {
                if (token !== state.token) return;
                state.episodesOf.all = episodes;
                state.episodesOf.seasons = [];
                episodes.forEach(function (ep) {
                    if (state.episodesOf.seasons.indexOf(ep.season) === -1) state.episodesOf.seasons.push(ep.season);
                });
                showSeason(0);
            })
            .catch(fail(items, 'EPISODES'));
    }

    function showSeason(index) {
        var show = state.episodesOf;
        show.season = Math.max(0, Math.min(show.seasons.length - 1, index));
        var season = show.seasons[show.season];
        items.set(
            show.all.filter(function (ep) {
                return show.seasons.length < 2 || ep.season === season;
            }),
            0,
            'No episodes'
        );
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
    function playSavedEpisode(entry) {
        var show = entry.show;
        record(entry, show, entry.episode);
        cached('episodes:' + show.series_id, function () {
            return state.adapter.episodes(show);
        })
            .then(function (list) {
                var index = -1;
                list.forEach(function (ep, i) {
                    if (String(ep.id) === String(entry.episode.id)) index = i;
                });
                hooks.play(index >= 0 ? episodeRequest(show, list, index) : state.adapter.episodeRequest(show, entry.episode));
            })
            .catch(function (err) {
                Log.error('EPISODES FAIL ' + err.message);
                hooks.play(state.adapter.episodeRequest(show, entry.episode));
            });
    }

    function closeEpisodes() {
        var previous = state.episodesOf;
        state.episodesOf = null;
        state.token++;
        applyView();
        items.set(previous.list, previous.index);
    }

    function activateItem() {
        var item = items.item();
        if (!item) return;
        if (state.section === 'sources') return sourceAction();
        if (item.episode) return playSavedEpisode(item);
        if (state.section === 'live') {
            record(item);
            return hooks.play(state.adapter.liveRequest(item));
        }
        if (state.section === 'movies') {
            record(item);
            return hooks.play(state.adapter.movieRequest(item));
        }
        if (state.episodesOf) {
            var show = state.episodesOf;
            record(item, show.show, item);
            return hooks.play(episodeRequest(show.show, show.all, show.all.indexOf(item)));
        }
        openEpisodes(item);
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

    function hasSeasons() {
        return !!(state.episodesOf && state.episodesOf.seasons && state.episodesOf.seasons.length > 1);
    }

    // Season pills above a show's episodes.
    function onPillsKey(code) {
        var show = state.episodesOf;
        if (code === KEY.LEFT || code === KEY.RIGHT) {
            var next = show.season + (code === KEY.LEFT ? -1 : 1);
            if (next >= 0 && next < show.seasons.length) {
                showSeason(next);
                renderChrome();
            }
        } else if (code === KEY.DOWN || code === KEY.ENTER) setZone('items');
        else if (isBack(code)) {
            closeEpisodes();
            setZone('items');
        } else return code === KEY.UP;
        return true;
    }

    function leaveItems() {
        if (state.episodesOf) closeEpisodes();
        else setZone('categories');
    }

    function onKey(code) {
        // OK repeats while held; the hold timer and keyup own that press.
        if (state.press && code === KEY.ENTER) return true;
        if (Menu.isOpen()) return Menu.onKey(code);
        if (state.searching) return onSearchKey(code);
        if (state.played) {
            state.played = false;
            refreshLibrary();
        }
        if (state.zone === 'toolbar') return onToolbarKey(code);
        if (state.zone === 'pills') return onPillsKey(code);
        if (state.zone === 'rail') {
            if (code === KEY.UP || code === KEY.DOWN) moveSection(code === KEY.UP ? -1 : 1);
            else if (code === KEY.RIGHT || code === KEY.ENTER) setZone('categories');
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
                if (!moveItems(code) && code === KEY.UP) {
                    if (hasSeasons()) setZone('pills');
                    else enterToolbar('items');
                }
            } else if (grid && code === KEY.RIGHT) items.move(1);
            else if (grid && code === KEY.LEFT && items.index() % items.cols() !== 0) items.move(-1);
            else if (code === KEY.ENTER) {
                // Holding OK opens the options menu; a short press opens on release.
                if (state.section === 'sources') activateItem();
                else {
                    var press = { fired: false };
                    press.timer = setTimeout(function () {
                        press.fired = true;
                        openItemMenu();
                    }, HOLD_MS);
                    state.press = press;
                }
            } else if (code === KEY.LEFT || isBack(code)) leaveItems();
            else return false;
        }
        return true;
    }

    document.addEventListener('keyup', function (event) {
        var press = state.press;
        if (!press || event.keyCode !== KEY.ENTER) return;
        clearTimeout(press.timer);
        state.press = null;
        if (!press.fired) activateItem();
    });

    // Next/previous live channel while watching; null at the ends of the list.
    function zap(delta) {
        if (state.section !== 'live' || !items.move(delta)) return null;
        record(items.item());
        return state.adapter.liveRequest(items.item());
    }

    function start() {
        var source = Sources.current();
        setSource(source);
        if (source) openSection('live');
        else openSection('sources');
        setZone('categories');
    }

    return {
        start: start,
        onKey: onKey,
        zap: zap,
        isLive: function () {
            return state.section === 'live';
        },
    };
};
