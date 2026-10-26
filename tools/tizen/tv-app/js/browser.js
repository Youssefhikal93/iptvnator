// The main screen, laid out like IPTVnator on the desktop: a section rail,
// a source pill in the header, a category side list and the content list.
window.Browser = function (hooks) {
    'use strict';

    var KEY = Keys;
    // Header toolbar: search, list, grid, then Sort or the Live TV guide.
    var TOOLS = ['search', 'list', 'grid', 'sort'];
    var STEPS = {};
    STEPS[KEY.UP] = -1;
    STEPS[KEY.DOWN] = 1;
    STEPS[KEY.CH_UP] = -10;
    STEPS[KEY.CH_DOWN] = 10;
    var SECTIONS = [
        { id: 'home', get label() { return I18n.t('rail.home'); }, icon: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z' },
        { id: 'sources', get label() { return I18n.t('rail.sources'); }, icon: 'M3 10h11v2H3zm0-4h11v2H3zm0 8h7v2H3zm13-1v8l6-4z' },
        { id: 'live', get label() { return I18n.t('rail.live'); }, icon: 'M21 6h-7.59l3.29-3.29L16 2l-4 4-4-4-.71.71L10.59 6H3c-1.1 0-2 .89-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.11-.9-2-2-2zm0 14H3V8h18v12zM9 10v8l7-4z' },
        { id: 'movies', get label() { return I18n.t('rail.movies'); }, icon: 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z' },
        { id: 'series', get label() { return I18n.t('rail.series'); }, icon: 'M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z' },
        { id: 'settings', get label() { return I18n.t('rail.settings'); }, icon: 'M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.07-.94l2.03-1.58-1.92-3.32-2.39.96a7.1 7.1 0 0 0-1.62-.94L14.87 3h-3.74l-.36 3.18c-.59.24-1.13.56-1.62.94l-2.39-.96-1.92 3.32 2.03 1.58c-.05.31-.07.63-.07.94s.02.63.06.94l-2.02 1.58 1.92 3.32 2.39-.96c.49.38 1.03.7 1.62.94l.36 3.18h3.74l.36-3.18c.59-.24 1.13-.55 1.62-.94l2.39.96 1.92-3.32zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z' },
    ];
    var $ = function (id) {
        return document.getElementById(id);
    };
    var state = { section: 'sources', zone: 'categories', source: null, adapter: null, info: null, token: 0, timer: null, catalogue: null, armed: null, base: null, search: null, showingSearch: false, searching: false, searchTimer: null, tool: 0, toolFrom: 'items', played: false, favKeys: null, toastTimer: null, updating: 0, added: {}, epg: null, epgWanted: [], epgTimer: null, redrawTimer: null, guide: null };
    var restoring = false;
    var account = Promise.resolve();
    var homeLoading = {};
    var libraryNavigation = LibraryNavigation({
        current: sourceId,
        capture: function () { return { section: state.section, category: categories.item() }; },
        switchSource: setSource,
        restore: restoreLibraryView,
        stop: function () { hooks.preview.stop(); },
        refresh: refreshLibrary,
    });
    var live = LiveChannels({
        categories: function () {
            return loadCatalogue({ section: 'live', kind: 'categories' }).then(function (list) {
                return HiddenCategories.visible(sourceId(), 'live', list);
            });
        },
        channels: function (categoryId) {
            return loadCatalogue({ section: 'live', kind: 'items', id: categoryId }).then(function (list) {
                return ParentalLock.filterItems(sourceId(), 'live', list);
            });
        },
        allows: function (channel) { return ParentalLock.allows(sourceId(), 'live', channel); },
        request: liveRequest,
        record: function (channel) {
            record(channel, null, null, 'live');
            Library.setLastChannel(sourceId(), channel);
        },
    });
    Prefs.onChange(function (name) {
        if (name === 'programmeGuide') updateEpg();
        // The rail, header and hints show the new language at once.
        if (name === 'language') {
            renderChrome();
            if (state.section === 'settings') settings.render();
        }
    });
    ParentalLock.onChange(function () {
        if (!ParentalLock.isUnlocked()) {
            // A pending OK must not open an item from the old unlocked list.
            Keys.repeat(KEY.RETURN);
            if (detail.isOpen()) detail.close();
            if (guide.isOpen()) guide.close();
            if (Menu.isOpen()) Menu.onKey(KEY.RETURN);
        }
        if (state.section === 'home') home.render();
        else if (state.section === 'settings') settings.render();
        else categoriesChanged(state.section);
    });
    // "Go to Sources" on the account screen lands on the source with the problem.
    LoadScreen.onSources(function () {
        libraryNavigation.cancel();
        var at = Sources.all().map(function (s) { return s.id; }).indexOf(state.source && state.source.id);
        openSection('sources');
        showSources(Math.max(0, at));
        setZone('categories');
    });
    XmltvGuide.onChange(function (id) {
        if (state.section === 'sources') categories.set(sourceRows(), categories.index(), '');
        if (!state.source || state.source.id !== id) return;
        if (state.guide) state.guide.stop();
        state.guide = Prefs.get('programmeGuide') ? GuideData(state.source, state.adapter) : null;
        if (state.section === 'live') items.select(items.index());
        else if (state.section === 'home') home.render();
    });
    var visible = { list: [], empty: '' };

    var categories = List($('categories'), {
        rows: 11,
        title: function () {
            return state.section === 'sources' ? I18n.t('browser.yourSources') : I18n.t('browser.categoriesOf', { section: sectionOf(state.section).label });
        },
        label: function (row) {
            return I18n.categoryName(row);
        },
        badge: function (row) {
            if (HiddenCategories.isReal(row) && ParentalLock.isLocked(sourceId(), state.section, row.category_id)) return '\ud83d\udd12';
            return row.source ? row.chip : row.count;
        },
        decorate: function (el, row) {
            if (row.source) SourceAccount.decorate(el, row);
        },
    });
    var detail = Detail();
    var manage = ManageCategories({
        sourceId: sourceId,
        load: function (section) {
            return state.catalogue.load({ section: section, kind: 'categories' }, { screen: false });
        },
        changed: categoriesChanged,
        toast: toast,
    });
    var settings = Settings({ toast: toast, manage: openManage, hiddenText: hiddenText });
    var watched = Watched({
        knownShow: function (show) {
            return state.catalogue.peek({ kind: 'show', id: show.series_id });
        },
        loadShow: loadShow,
        changed: function () {
            refreshLibrary();
            detail.refresh();
        },
        toast: toast,
    });
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
        isNew: function (entry) {
            return !otherSource(entry.item) && entry.section === 'series' && NewEpisodes.isNew(sourceId(), entry.item, seriesList());
        },
        watched: function (entry) {
            return !otherSource(entry.item) && watched.isWatched(entry.item, entry.section);
        },
        programme: function (item) {
            if (!state.epg || otherSource(item)) return null;
            var programmes = state.epg.peek(item);
            if (programmes === undefined) return wantProgramme(item), null;
            return programmes.now;
        },
    });
    var items = List($('items'), {
        rows: 9,
        title: function () {
            if (state.section === 'sources') return I18n.t('browser.source');
            if (state.showingSearch) return I18n.t('browser.searchTitle', { query: state.search.query });
            var category = categories.item();
            return category ? I18n.categoryName(category) : '';
        },
        subtitle: sortSubtitle,
        decorate: decorate,
        label: itemLabel,
        icon: function (it) {
            return it.stream_icon || it.cover || it.logo || null;
        },
    });
    var guide = TvGuide({
        play: function (channel) { openEntry(channel, 'live'); },
        catchUp: function (channel, programme) {
            var req = catchUpRequest(channel, programme);
            if (!req) return;
            state.played = true;
            hooks.play(req);
        },
        indexOf: live.indexOf,
        close: function (channel) {
            var index = live.indexOf(items.items(), channel);
            if (index >= 0) items.select(index);
            setZone(items.items().length ? 'items' : 'categories');
        },
    });

    function guideAvailable() {
        return state.section === 'live' && state.guide && state.guide.available;
    }

    function openGuide() {
        if (!guideAvailable()) return false;
        hooks.preview.stop();
        if (state.searching) {
            clearTimeout(state.searchTimer);
            stopTyping();
        }
        var category = categories.item();
        // Category focus moves before the list debounce; Favorites must never
        // open the previous category's channels when Guide is pressed quickly.
        if (category && category.virtual && !state.showingSearch) {
            clearTimeout(state.timer);
            showVirtual(category, items.index());
        }
        guide.open({ guide: state.guide, channels: items.items().slice(), index: items.index(),
            title: state.showingSearch ? I18n.t('browser.searchResults') : category ? I18n.categoryName(category) : I18n.t('browser.allChannels') });
        return true;
    }

    function itemLabel(it) {
        if (it.label) return it.label;
        return (it.num && state.section === 'live' ? it.num + '. ' : '') + it.name;
    }

    // ---- Library: favorites, recently watched, continue watching ----

    function sourceId() {
        return state.source.id;
    }

    function otherSource(item) {
        return item.sourceId && item.sourceId !== sourceId();
    }

    function libraryList(kind, section) {
        return Prefs.get('librarySources') === 'all' ? LibraryAll[kind](section, sourceId()) : Library[kind](sourceId(), section);
    }

    function restoreLibraryView(view, item) {
        if (view.section === 'home') {
            openSection('home');
            setZone('home');
            return Promise.resolve();
        }
        var adapter = state.adapter;
        return openSection(view.section).then(function () {
            if (adapter !== state.adapter || view.section !== state.section) return;
            var rows = categoryRows();
            showCategories(indexIn(rows, view.category, 0));
            loadItems();
            var at = items.items().map(function (entry) {
                return (entry.sourceId || sourceId()) + ':' + Library.keyOf(view.section, entry);
            }).indexOf(item.sourceId + ':' + Library.keyOf(view.section, item));
            if (at >= 0) items.select(at);
            setZone('items');
        });
    }

    function favoriteTarget(item) {
        return item.episode ? item.show : item;
    }

    // The series catalogue, whose dates tell whether a show has new episodes.
    function seriesList() {
        return state.catalogue && state.catalogue.peek({ section: 'series', kind: 'items' });
    }

    // section: the item's own section (Home mixes them); the open one by default.
    function isFavorite(item, section) {
        section = section || state.section;
        if (otherSource(item)) return Library.isFavorite(item.sourceId, section, favoriteTarget(item));
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
        LibraryChip(el, item, sourceId());
        if (isFavorite(item)) {
            var star = document.createElement('span');
            star.className = 'star';
            star.textContent = '\u2605';
            el.appendChild(star);
        }
        if (otherSource(item)) return;
        if (state.section === 'live') {
            if (state.source.type === 'xtream') CatchUp.decorate(el, item);
            return showProgramme(el, item);
        }
        if (state.section === 'series' && NewEpisodes.isNew(sourceId(), item, seriesList())) el.appendChild(NewEpisodes.badge());
        if (watched.isWatched(item, state.section)) {
            var tick = document.createElement('span');
            tick.className = 'watched-tick';
            tick.textContent = '\u2713';
            tick.setAttribute('aria-label', I18n.t('browser.watched'));
            el.appendChild(tick);
        }
        var p = Progress.of(Progress.id(state.section, item));
        if (p && p.status === 'continue') {
            var bar = document.createElement('div');
            bar.className = 'bar';
            var fill = document.createElement('div');
            fill.className = 'fill';
            fill.style.width = Progress.bar(p.ratio);
            bar.appendChild(fill);
            el.appendChild(bar);
        }
    }

    // ---- Now/next on live channels ----

    function updateEpg() {
        clearTimeout(state.epgTimer);
        clearTimeout(state.redrawTimer);
        state.epgWanted = [];
        if (state.epg) state.epg.stop();
        state.epg = state.adapter && (state.adapter.nowNext || state.source.epgUrl) && Prefs.get('programmeGuide') ? Epg(state.adapter, state.source) : null;
        if (state.guide) state.guide.stop();
        // The full schedule (TV guide grid) from the guide sources in GuideData.chain.
        state.guide = state.adapter && Prefs.get('programmeGuide') ? GuideData(state.source, state.adapter) : null;
    }

    function liveRequest(channel) {
        var req = state.adapter.liveRequest(channel);
        if (state.source.type === 'xtream' && CatchUp.available(channel)) {
            req.watchFromStart = function (programme) {
                var archive = catchUpRequest(channel, programme);
                if (!archive) return;
                archive.returnTo = req;
                hooks.play(archive);
            };
        }
        var epg = state.epg;
        if (epg) {
            req.programmes = function () {
                return epg.load(channel);
            };
        }
        return req;
    }

    function catchUpRequest(channel, programme) {
        var login = Object.assign({}, state.source, { server_info: state.info && state.info.server_info });
        var req = CatchUp.request(channel, programme, login);
        if (req) req.backToLive = function () { openEntry(channel, 'live'); };
        return req;
    }

    // The current programme under a channel's name, and how far it is.
    function showProgramme(el, item) {
        if (!state.epg) return;
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
            { category_id: '__fav', category_name: I18n.t('browser.favorites'), virtual: 'favorites', count: libraryList('favorites', section).length },
            { category_id: '__recent', category_name: I18n.t('browser.recentlyWatched'), virtual: 'recent', count: libraryList('recent', section).length },
        ];
        if (section !== 'live') {
            rows.push({ category_id: '__continue', category_name: I18n.t('browser.continueWatching'), virtual: 'continue', count: Library.continueWatching(id, section).length });
        }
        if (sortableSection() && addedOf(section).length) {
            rows.unshift({ category_id: '__added', category_name: I18n.t('browser.recentlyAdded'), virtual: 'added', count: addedOf(section).length });
        }
        if (section !== 'live' && Tmdb.enabled()) rows.unshift({ category_id: '__discover', category_name: I18n.t('browser.discover'), virtual: 'discover' });
        return rows;
    }

    // The catalogue's categories minus the hidden ones, after the virtual rows.
    function categoryRows(list) {
        return virtualRows().concat(HiddenCategories.visible(sourceId(), state.section, list || state.base || []));
    }

    function showCategories(index) {
        categories.set(categoryRows(), index, I18n.t('browser.noCategories'));
    }

    // Recently added, without items of hidden categories.
    function addedOf(section) {
        return ParentalLock.filterItems(sourceId(), section, HiddenCategories.filterItems(sourceId(), section, state.added[section] || []));
    }

    function virtualList(kind) {
        var id = sourceId();
        if (kind === 'added') return addedOf(state.section);
        if (Prefs.get('librarySources') === 'all' && (kind === 'favorites' || kind === 'recent')) return libraryList(kind, state.section);
        if (kind === 'favorites') return sortableSection() ? Library.favoriteItems(id, state.section, state.catalogue.peek({ section: state.section, kind: 'items' }) || []) : Library.favorites(id, state.section);
        if (kind === 'recent') return Library.recent(id, state.section);
        return Library.continueWatching(id, state.section);
    }

    var EMPTY = {
        get favorites() { return [I18n.t('empty.favorites.title'), I18n.t('empty.favorites.hint')]; },
        get recent() { return [I18n.t('empty.recent.title'), I18n.t('empty.recent.hint')]; },
        get continue() { return [I18n.t('empty.continue.title'), I18n.t('empty.continue.hint')]; },
        get added() { return [I18n.t('empty.added.title'), I18n.t('empty.added.hint')]; },
    };

    function showVirtual(category, index) {
        state.token++;
        state.showingSearch = false;
        applyView();
        setItems(category.virtual === 'discover' ? [] : virtualList(category.virtual).filter(function (item) {
            return ParentalLock.allows(item.sourceId || sourceId(), state.section, item);
        }), index || 0, category.virtual === 'discover' ? [I18n.t('browser.discover'), I18n.t('empty.discover.hint')] : EMPTY[category.virtual]);
        renderChrome();
    }

    function record(item, show, episode, section) {
        if (episode) NewEpisodes.markSeen(sourceId(), show, seriesList());
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

    function toast(text, ms) {
        var el = $('toast');
        el.textContent = text;
        el.classList.remove('hidden');
        clearTimeout(state.toastTimer);
        state.toastTimer = setTimeout(function () {
            el.classList.add('hidden');
        }, ms || 1800);
    }

    function toggleFavorite(item, section) {
        section = section || state.section;
        if (!item || section === 'sources') return;
        var target = favoriteTarget(item);
        var added = Library.toggleFavorite(item.sourceId || sourceId(), section, target);
        toast(I18n.t(added ? 'toast.favoriteAdded' : 'toast.favoriteRemoved', { name: target.name }));
        refreshLibrary();
    }

    // Hold OK on an item: play, favorite and library actions, like the
    // desktop's item context menu.
    function openItemMenu(item, section) {
        if (!item) return;
        var options = [
            {
                label: I18n.t(section === 'live' ? 'menu.watch' : item.episode ? 'menu.play' : 'menu.details'),
                run: function () {
                    openEntry(item, section);
                },
            },
        ];
        if (section === 'movies' && !item.episode) {
            options.push({
                label: I18n.t('menu.play'),
                run: function () {
                    playMovie(item);
                },
            });
        }
        options.push({
            label: I18n.t(isFavorite(item, section) ? 'menu.removeFavorite' : 'menu.addFavorite'),
            run: function () {
                toggleFavorite(item, section);
            },
        });
        var progressId = Progress.id(section, item);
        var progress = section === 'live' || otherSource(item) ? null : Progress.of(progressId);
        if (progress && progress.status === 'continue') {
            options.push({
                label: I18n.t('menu.removeContinue'),
                run: function () {
                    Progress.clear(progressId);
                    toast(I18n.t('toast.removedContinue'));
                    refreshLibrary();
                },
            });
        }
        if (Library.isRecent(item.sourceId || sourceId(), section, item)) {
            options.push({
                label: I18n.t('menu.removeRecent'),
                run: function () {
                    Library.removeRecent(item.sourceId || sourceId(), section, item);
                    toast(I18n.t('toast.removedRecent'));
                    refreshLibrary();
                },
            });
        }
        options.push({ label: I18n.t('common.cancel') });
        if (otherSource(item)) Menu.open(itemLabel(item), options);
        else watched.openItemMenu(item, section, options, itemLabel(item));
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

    function sortableSection() {
        return state.source && state.source.type === 'xtream' && (state.section === 'movies' || state.section === 'series');
    }

    function sortMode() {
        if (!sortableSection()) return null;
        var category = !state.showingSearch && categories.item();
        if (category && category.virtual === 'favorites' && Prefs.get('librarySources') === 'all') return null;
        if (category && category.virtual === 'added') return 'newest';
        if (category && category.virtual && category.virtual !== 'favorites') return null;
        return Library.sort(sourceId(), state.section);
    }

    function sortSubtitle() {
        var mode = sortMode();
        var option = Sort.options.filter(function (entry) {
            return entry.id === mode;
        })[0];
        return option ? I18n.t('browser.sortedBy', { sort: option.label.toLowerCase() }) : '';
    }

    function setItems(list, index, empty) {
        visible = { list: list, empty: empty };
        var mode = sortMode();
        items.set(mode ? Sort.order(list, state.section, mode) : list.slice(), index, empty);
    }

    function toolbarTools() {
        var category = !state.showingSearch && categories.item();
        var canSort = sortableSection() && (!category || !category.virtual || (category.virtual === 'favorites' && Prefs.get('librarySources') !== 'all'));
        var tools = canSort ? TOOLS : TOOLS.slice(0, 3);
        return guideAvailable() ? tools.concat(['guide']) : tools;
    }

    function openSortMenu() {
        var current = Library.sort(sourceId(), state.section);
        Menu.open(I18n.t('browser.sort'), Sort.options.map(function (option) {
            return {
                label: (option.id === current ? '\u2713 ' : '') + option.label,
                run: function () {
                    Library.setSort(sourceId(), state.section, option.id);
                    setItems(visible.list, 0, visible.empty);
                    setZone(items.items().length ? 'items' : 'categories');
                },
            };
        }));
    }

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
        items.loading();
        return loadCatalogue({ section: section, kind: 'items' })
            .then(function (all) {
                if (token !== state.token) return 0;
                state.search.results = ParentalLock.filterItems(sourceId(), section, HiddenCategories.filterItems(sourceId(), section, all)).filter(function (it) {
                    return String(it.name).toLowerCase().indexOf(needle) !== -1;
                });
                setItems(state.search.results, 0, [I18n.t('empty.search.title', { query: query }), I18n.t('empty.search.hint')]);
                renderChrome();
                return state.search.results.length;
            })
            .catch(function (err) {
                if (token === state.token) fail(items, 'SEARCH')(err);
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
        var tools = toolbarTools();
        var tool = tools[state.tool];
        if (code === KEY.LEFT && state.tool > 0) state.tool--;
        else if (code === KEY.RIGHT && state.tool < tools.length - 1) state.tool++;
        else if (code === KEY.LEFT) setZone('rail');
        else if (code === KEY.DOWN || Keys.isBack(code)) leaveToolbar();
        else if (code === KEY.ENTER && tool === 'search') startTyping();
        else if (code === KEY.ENTER && tool === 'sort') openSortMenu();
        else if (code === KEY.ENTER && tool === 'guide') openGuide();
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
        return id === 'sources' || id === 'settings' || (state.adapter && state.adapter.sections.indexOf(id) !== -1);
    }

    function loadCatalogue(what, onFresh) {
        return state.catalogue.load(what, {
            screen: !Player.isOpen() || hooks.preview.active(),
            active: function () { return catalogueActive(what); },
            onFresh: onFresh,
        });
    }

    function catalogueActive(what) {
        var section = what.section;
        var wholeSection = what.kind === 'items' && (what.id === undefined || what.id === '');
        if (state.section === 'home') return !!homeLoading[section] && wholeSection;
        if (state.section !== section) return false;
        if (what.kind === 'categories') return !state.base;
        if (state.showingSearch) return wholeSection;
        var category = categories.item();
        if (!category) return false;
        if (category.virtual) return wholeSection && (category.virtual === 'added' || category.virtual === 'favorites');
        return what.kind === 'items' && String(what.id === undefined ? '' : what.id) === String(category.category_id);
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
        LoadScreen.render();
        $('rail').innerHTML = '';
        SECTIONS.forEach(function (section) {
            var el = document.createElement('div');
            el.className =
                'rail-item' +
                (section.id === state.section ? ' active' : '') +
                (section.id === state.section && state.zone === 'rail' ? ' focused' : '') +
                (section.id === 'settings' ? ' rail-bottom' : '') +
                (available(section.id) ? '' : ' disabled');
            el.innerHTML =
                '<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="' + section.icon + '"/></svg><span></span>';
            el.lastChild.textContent = section.label;
            $('rail').appendChild(el);
        });
        $('source-name').textContent = state.source ? state.source.name : I18n.t('browser.noSource');
        $('source-type').textContent = state.source ? Sources.typeLabel(state.source) + (state.updating ? ' · ' + I18n.t('browser.updating') : '') : I18n.t('browser.addInSources');
        renderToolbar();
        $('hints').textContent =
            state.section === 'settings'
                ? I18n.t('hints.settings')
                : state.zone === 'home'
                ? I18n.t('hints.home')
                : state.zone === 'items' && state.section !== 'sources'
                ? I18n.t('hints.items')
                : state.zone === 'categories' && state.section !== 'sources'
                ? I18n.t('hints.categories')
                : I18n.t('hints.default');
    }

    function renderToolbar() {
        var on = hasTools();
        var tools = toolbarTools();
        state.tool = Math.min(state.tool, tools.length - 1);
        var focus = state.zone === 'toolbar' ? tools[state.tool] : null;
        $('header').classList.toggle('no-tools', !on);
        $('searchbar').classList.toggle('focused', focus === 'search');
        var input = $('search-input');
        input.placeholder = on ? I18n.t('browser.searchIn', { section: sectionOf(state.section).label }) : I18n.t('browser.search');
        if (!state.searching) input.value = state.showingSearch ? state.search.query : '';
        Array.prototype.forEach.call(document.querySelectorAll('.view-btn'), function (btn) {
            var mode = btn.getAttribute('data-mode');
            if (mode === 'sort') btn.classList.toggle('hidden', !on || tools.indexOf('sort') === -1);
            if (mode === 'guide') btn.classList.toggle('hidden', !guideAvailable());
            btn.classList.toggle('active', on && viewMode() === mode);
            btn.classList.toggle('focused', focus === mode);
        });
    }

    // The rail opens the content area belonging to the selected screen.
    function contentZone() {
        return state.section === 'settings' ? 'settings' : state.section === 'home' ? 'home' : 'categories';
    }

    function setZone(zone) {
        if (state.zone === 'rail' && zone !== 'rail') LoadScreen.enter();
        state.zone = zone;
        categories.setActive(zone === 'categories');
        items.setActive(zone === 'items');
        home.setActive(zone === 'home');
        settings.setActive(zone === 'settings');
        renderChrome();
    }

    function fail(list, label) {
        return function () {
            Log.error(label + ' FAIL');
            list.set([], 0, [I18n.t('empty.failed.title'), I18n.t('empty.failed.hint')]);
        };
    }

    // ---- Sources section ----

    function sourceRows() {
        var current = state.source && state.source.id;
        return Sources.all()
            .map(function (s) {
                return Object.assign({ category_name: s.name, source: s }, SourceAccount.row(s, s.id === current, XmltvGuide.subtitle(s)));
            })
            .concat([
                { category_name: I18n.t('sources.addXtream'), action: 'xtream' },
                { category_name: I18n.t('sources.addM3u'), action: 'm3u' },
            ]);
    }

    function showSourceDetails() {
        var row = categories.item();
        state.armed = null;
        if (!row || !row.source) {
            items.set([], 0, row ? I18n.t('sources.pressToAdd') : '');
        } else {
            var isCurrent = state.source && row.source.id === state.source.id;
            var rows = [
                { label: I18n.t(isCurrent ? 'sources.watch' : 'sources.switch'), action: 'open' },
                { label: I18n.t('sources.refresh'), action: 'refresh' },
                { label: I18n.t('sources.edit'), action: 'edit' },
                { label: I18n.t('common.remove'), action: 'remove' },
                { label: Sources.typeLabel(row.source) + ' · ' + row.source.url },
            ];
            items.set(rows.concat(SourceAccount.detailRows(row.source, isCurrent ? state.info : null)), 0);
        }
        renderChrome();
    }

    function showSources(index) {
        categories.set(sourceRows(), index || 0, '');
        showSourceDetails();
        SourceAccount.refresh(Sources.all(), sourcesChecked);
    }

    // A background check finished: redraw the rows, and the details unless the
    // viewer is inside them.
    function sourcesChecked() {
        if (state.section !== 'sources') return;
        categories.set(sourceRows(), categories.index(), '');
        if (state.zone !== 'items') showSourceDetails();
    }

    function sourceEdited(updated, reconnect) {
        var current = state.source && state.source.id === updated.id;
        if (reconnect && current) {
            state.catalogue.drop().then(function () {
                setSource(updated);
                sourcesChecked();
            });
        } else if (reconnect) {
            Catalogue.drop(updated.id);
        } else if (current) {
            state.source = updated;
            updateEpg();
        }
        showSources(categories.index());
    }

    function editSource(source) {
        SourceEdit(source, { openForm: hooks.openForm, saved: sourceEdited })();
    }

    function sourceGuideOptions(source) {
        return SourceGuide(source, { openForm: hooks.openForm, changed: function (updated) {
            if (state.source && state.source.id === updated.id) {
                state.source = updated;
                updateEpg();
            }
            showSources(categories.index());
        } });
    }

    function openSourceMenu() {
        var row = categories.item();
        if (!row || !row.source) return;
        var edit = { label: I18n.t('sources.edit'), run: function () { editSource(row.source); } };
        Menu.open(row.source.name, [edit].concat(sourceGuideOptions(row.source)));
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
            var dropping = state.source && row.source.id === sourceId() ? state.catalogue.drop() : Catalogue.drop(row.source.id);
            dropping.then(function () {
                toast(I18n.t('toast.reloading', { name: row.source.name }));
                setSource(row.source);
                openSection('home');
                setZone(contentZone());
            });
        } else if (action === 'edit') {
            editSource(row.source);
        } else if (action === 'remove') {
            if (state.armed !== row.source.id) {
                state.armed = row.source.id;
                items.items()[items.index()].label = I18n.t('sources.pressAgain');
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

    function setSource(source, screenReady) {
        hooks.preview.stop();
        if (state.catalogue) state.catalogue.dispose();
        state.catalogue = null;
        LoadScreen.reset();
        state.token++;
        live.reset();
        restoring = false;
        state.source = source;
        state.adapter = null;
        updateEpg();
        state.info = null;
        state.base = null;
        state.search = null;
        state.showingSearch = false;
        state.favKeys = null;
        state.added = {};
        homeLoading = {};
        home.reset(!!screenReady);
        if (!source) return renderChrome();
        Sources.setCurrent(source.id);
        state.adapter = source.type === 'xtream' ? XtreamSource(source) : M3uSource(source);
        XmltvGuide.ensure(source);
        updateEpg();
        var adapter = state.adapter;
        account = LoadScreen.run(source.id + ':account', function () {
            return SourceAccount.track(source, adapter.account());
        }, function () {
            return adapter === state.adapter && state.section !== 'sources' && state.section !== 'settings' && (!screenReady || screenReady());
        })
            .then(function (info) {
                if (adapter !== state.adapter) return;
                state.info = info;
                SourceAccount.warn(source, info, toast);
                // An M3U playlist learns its sections only once it is downloaded.
                if (source.type !== 'xtream' && adapter.sections.length > 1) {
                    renderChrome();
                    if (state.section === 'home') showHome();
                }
                if (state.section === 'sources') showSourceDetails();
            });
        var checked = account;
        state.catalogue = CatalogueLoader({
            adapter: adapter,
            sourceId: source.id,
            store: Catalogue,
            screen: function (key, load, active) {
                return LoadScreen.run(key, function () { return checked.then(load); }, function () { return active() && (!screenReady || screenReady()); });
            },
            onUpdating: function (count) {
                state.updating = count;
                renderChrome();
            },
        });
        renderChrome();
        return account;
    }

    function openSection(id) {
        if (!available(id)) return;
        if (id !== 'live') hooks.preview.stop();
        state.section = id;
        clearTimeout(state.timer);
        clearTimeout(state.searchTimer);
        $('content').classList.toggle('home', id === 'home');
        $('content').classList.toggle('settings', id === 'settings');
        state.showingSearch = false;
        state.base = null;
        state.favKeys = null;
        var token = ++state.token;
        applyView();
        items.set([], 0, '');
        if (id === 'sources') return showSources(0);
        if (id === 'home') return showHome();
        if (id === 'settings') {
            settings.render();
            return renderChrome();
        }
        categories.loading();
        items.loading();
        renderChrome();
        return loadCatalogue(
            { section: id, kind: 'categories' },
            function (list) {
                if (state.section !== id || !state.base) return;
                state.base = list;
                showCategories(indexIn(categoryRows(), categories.item(), categories.index()));
            }
        )
            .then(function (list) {
                if (token !== state.token) return;
                state.base = list;
                showCategories(virtualRows().length);
                loadItems();
                if (sortableSection()) loadRecentlyAdded(id);
            })
            .catch(function (err) {
                if (token === state.token) fail(categories, 'CATEGORIES')(err);
            });
    }

    // "All channels" spans categories; any other list is just its own category.
    function shownItems(category, list) {
        list = String(category.category_id) === '' ? HiddenCategories.filterItems(sourceId(), state.section, list) : list;
        return ParentalLock.filterItems(sourceId(), state.section, list);
    }

    function loadItems() {
        var category = categories.item();
        if (!category || state.section === 'sources') return;
        if (category.virtual) return showVirtual(category);
        if (ParentalLock.isLocked(sourceId(), state.section, category.category_id) && !ParentalLock.isUnlocked()) {
            state.token++;
            state.showingSearch = false;
            setItems([], 0, [I18n.t('empty.locked.title'), I18n.t('empty.locked.hint')]);
            return renderChrome();
        }
        var section = state.section;
        var token = ++state.token;
        state.showingSearch = false;
        applyView();
        items.loading();
        renderChrome();
        loadCatalogue(
            { section: section, kind: 'items', id: category.category_id },
            function (list) {
                if (token !== state.token) return;
                var item = items.item();
                var index = items.index();
                setItems(shownItems(category, list), 0, I18n.t('empty.category.title'));
                items.select(Math.max(0, Math.min(items.items().length - 1, indexIn(items.items(), item, index))));
            }
        )
            .then(function (list) {
                if (token === state.token) setItems(shownItems(category, list), 0, [I18n.t('empty.category.title'), I18n.t('empty.category.hint')]);
            })
            .catch(function (err) {
                if (token === state.token) fail(items, 'ITEMS')(err);
            });
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
                if (err.code === 'cancelled') return;
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
        if (otherSource(entry.item)) return null;
        return Progress.of(Progress.id(entry.section, entry.item));
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
                if (item.episode && Progress.unfinished('series', item)) list.push({ item: item, section: 'series' });
            });
        }
        return list.filter(function (entry) {
            return ParentalLock.allows(id, entry.section, entry.item);
        }).sort(function (a, b) {
            return progressOf(b).updatedAt - progressOf(a).updatedAt;
        });
    }

    // Home rows leave out items of hidden categories (Continue watching stays).
    function shownEntries(section, list) {
        return entriesOf(section, list.filter(function (item) {
            var id = item.sourceId || sourceId();
            return HiddenCategories.allows(id, section, item) && ParentalLock.allows(id, section, item);
        }));
    }

    function homeRows() {
        var id = sourceId();
        return [
            { id: 'continue', title: I18n.t('browser.continueWatching'), entries: continueEntries().slice(0, HOME_ROW_MAX) },
            { id: 'new-episodes', title: I18n.t('home.newEpisodes'), entries: shownEntries('series', NewEpisodes.entries(id, seriesList())) },
            { id: 'live', title: I18n.t('home.liveFavorites'), entries: shownEntries('live', libraryList('favorites', 'live')) },
            { id: 'fav-movies', title: I18n.t('home.favMovies'), entries: shownEntries('movies', libraryList('favorites', 'movies')) },
            { id: 'fav-series', title: I18n.t('home.favSeries'), entries: shownEntries('series', libraryList('favorites', 'series')) },
            { id: 'new-movies', title: I18n.t('home.newMovies'), entries: entriesOf('movies', addedOf('movies')), loading: homeLoading.movies },
            { id: 'new-series', title: I18n.t('home.newSeries'), entries: entriesOf('series', addedOf('series')), loading: homeLoading.series },
            { id: 'recent-live', title: I18n.t('home.recentLive'), entries: shownEntries('live', libraryList('recent', 'live')) },
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
        return state.catalogue.load({ kind: 'movie', id: entry.item.stream_id, item: entry.item });
    }

    // Home takes 20 from the same dated items used by the section's category.
    function loadRecentlyAdded(onlySection) {
        (onlySection ? [onlySection] : ['movies', 'series']).forEach(function (section) {
            var adapter = state.adapter;
            if (!available(section) || state.added[section]) return;
            state.added[section] = [];
            homeLoading[section] = true;
            var update = function (list) {
                if (adapter !== state.adapter) return;
                homeLoading[section] = false;
                updateRecentlyAdded(section, list);
            };
            loadCatalogue({ section: section, kind: 'items' }, update)
                .then(update)
                .catch(function (err) {
                    if (adapter === state.adapter) delete state.added[section];
                    Log.error('RECENTLY ADDED FAIL ' + err.message);
                });
        });
    }

    function updateRecentlyAdded(section, list) {
        state.added[section] = Sort.recentlyAdded(list, section, 50);
        if (state.section === 'home') return home.render();
        if (state.section !== section || !state.base) return;
        var category = categories.item();
        showCategories(indexIn(categoryRows(), category, categories.index()));
        if (category && !state.showingSearch && (category.virtual === 'added' || category.virtual === 'favorites')) {
            showVirtual(categories.item(), items.index());
        }
        // Badges follow the refreshed dates in every list of shows.
        if (section === 'series' && items.items().length) items.select(items.index());
        renderChrome();
    }

    function showHome() {
        home.render();
        renderChrome();
        loadRecentlyAdded();
        home.render();
    }

    // ---- Detail pages ----

    function clock(secs) {
        var h = Math.floor(secs / 3600);
        var m = Math.floor((secs % 3600) / 60);
        var sec = Math.floor(secs % 60);
        return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + sec).slice(-2);
    }

    // resume: true / false skips the player's Resume prompt.
    function playMovie(movie, resume) {
        if (otherSource(movie)) return libraryNavigation.open(movie, function () { playMovie(movie, resume); });
        record(movie, null, null, 'movies');
        var req = state.adapter.movieRequest(movie);
        if (resume !== undefined) req.resume = resume;
        hooks.play(req);
    }

    function openMovie(movie) {
        detail.open({
            item: movie,
            catalogue: tmdbCatalogue,
            open: openEntry,
            load: function () {
                if (!state.adapter.movieInfo) return Promise.resolve(null);
                return state.catalogue.load({ kind: 'movie', id: movie.stream_id, item: movie });
            },
            actions: function () {
                var p = Progress.unfinished('movies', movie);
                var list = p
                    ? [
                          { label: I18n.t('detail.resumeFrom', { time: clock(p.position) }), progress: p.ratio, run: playMovie.bind(null, movie, true) },
                          { label: I18n.t('detail.startOver'), run: playMovie.bind(null, movie, false) },
                      ]
                    : [{ label: I18n.t('detail.play'), run: playMovie.bind(null, movie, undefined) }];
                list.push({
                    label: I18n.t(isFavorite(movie, 'movies') ? 'menu.removeFavorite' : 'menu.addFavorite'),
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
        return state.catalogue.load({ kind: 'show', id: show.series_id, item: show }, { onFresh: onFresh });
    }

    function playEpisode(show, list, index, resume) {
        record(list[index], show, list[index]);
        var req = episodeRequest(show, list, index);
        if (resume !== undefined) req.resume = resume;
        hooks.play(req);
    }

    function openShow(show) {
        NewEpisodes.markSeen(sourceId(), show, seriesList());
        var episodes = DetailEpisodes({
            progressOf: function (ep) {
                return Progress.of(Progress.episodeId(ep));
            },
            play: function (list, index, resume) {
                playEpisode(show, list, index, resume);
            },
        });
        detail.open({
            item: show,
            catalogue: tmdbCatalogue,
            open: openEntry,
            episodes: episodes,
            onClose: refreshLibrary,
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
                    label: I18n.t(isFavorite(show, 'series') ? 'menu.removeFavorite' : 'menu.addFavorite'),
                    run: function () {
                        toggleFavorite(show, 'series');
                        detail.refresh();
                    },
                });
                return list;
            },
        });
    }

    function tmdbCatalogue() {
        return Promise.all(['movies', 'series'].map(function (section) {
            if (state.adapter.sections.indexOf(section) === -1) return [];
            return state.catalogue.load({ section: section, kind: 'items' }, { screen: false }).then(function (list) {
                return ParentalLock.filterItems(sourceId(), section, HiddenCategories.filterItems(sourceId(), section, list)).map(function (item) {
                    return { item: item, type: section === 'movies' ? 'movie' : 'tv' };
                });
            }).catch(function () { return []; });
        })).then(function (lists) { return lists[0].concat(lists[1]); });
    }

    // OK on a channel, movie, show or saved episode of `section`.
    function openEntry(item, section) {
        if (otherSource(item)) return libraryNavigation.open(item, function () { openEntry(item, section); });
        if (item.episode) return playSavedEpisode(item);
        if (section === 'live') {
            return hooks.play(live.play(item, state.section === 'live' ? items.items().filter(function (channel) { return !otherSource(channel); }) : null));
        }
        if (section === 'movies') return openMovie(item);
        openShow(item);
    }

    function activateItem() {
        var item = items.item();
        if (!item) return;
        if (state.section === 'sources') return sourceAction();
        if (otherSource(item)) return openEntry(item, state.section);
        // OK on a channel previews it beside the list (see live-preview.js).
        if (state.section === 'live' && !item.episode && hooks.preview.open(item, items.items().filter(function (channel) { return !otherSource(channel); }))) return;
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

    // ---- Hidden categories ----

    function openManage(section) {
        if (!state.adapter || !available(section)) return toast(I18n.t('toast.chooseSource', { section: sectionOf(section).label }));
        manage.open(section);
    }

    function hiddenText(section) {
        if (!state.adapter || !available(section)) return I18n.t('browser.notAvailable');
        var count = HiddenCategories.count(sourceId(), section);
        return count ? I18n.t('browser.hidden', { count: count }) : I18n.t('browser.allShown');
    }

    // Hold OK on a category: hide it, hide the rest, or manage them all.
    function openCategoryMenu(row) {
        var options = manage.menu(state.section, row, state.base);
        if (HiddenCategories.isReal(row)) options.splice(options.length - 1, 0, ParentalMenu.category(sourceId(), state.section, row));
        Menu.open(row.category_name, options);
    }

    function enterCategory() {
        var row = categories.item();
        if (row && ParentalLock.isLocked(sourceId(), state.section, row.category_id) && !ParentalLock.isUnlocked()) {
            return PinPad.open('unlock', function () {
                setZone('items');
            });
        }
        if (items.items().length) setZone('items');
    }

    // After hiding or showing categories: redraw the list. A category that
    // went away hands the focus to the next one, whose items then open.
    function categoriesChanged(section) {
        if (state.section === 'settings') return settings.render();
        if (state.section !== section || !state.base) return;
        showCategories(indexIn(categoryRows(), categories.item(), categories.index()));
        if (state.showingSearch) runSearch();
        else loadItems();
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

    function onHomeKey(code) {
        var entry = home.focused();
        if (code === KEY.ENTER && entry) {
            Keys.press(
                function () {
                    openEntry(entry.item, entry.section);
                },
                function () {
                    openItemMenu(entry.item, entry.section);
                }
            );
        } else if (Keys.isBack(code) || home.key(code) === 'left') setZone('rail');
        return true;
    }

    function onKey(code) {
        restoring = false;
        if (Keys.repeat(code)) return true;
        if (Menu.isOpen()) return Menu.onKey(code);
        if (manage.isOpen()) return manage.onKey(code);
        if (Actor.isOpen()) return Actor.key(code);
        if (detail.isOpen()) {
            var selection = detail.episodeSelection();
            if (code !== KEY.ENTER || !selection) return detail.onKey(code);
            Keys.press(function () {
                detail.onKey(code);
            }, function () {
                watched.openEpisodeMenu(selection);
            });
            return true;
        }
        if (Discover.isOpen()) return Discover.key(code);
        var loadKey = LoadScreen.key(code);
        if (loadKey === 'exit') hooks.exit();
        if (loadKey) return true;
        if (libraryNavigation.busy()) {
            if (Keys.isBack(code)) libraryNavigation.cancel();
            return true;
        }
        if (guide.isOpen()) return guide.key(code);
        if (code === 458 && openGuide()) return true;
        if (state.searching) return onSearchKey(code);
        if (Keys.isBack(code) && hooks.preview.active()) {
            hooks.preview.stop();
            return true;
        }
        if (state.zone === 'toolbar') return onToolbarKey(code);
        if (state.zone === 'home') return onHomeKey(code);
        if (state.zone === 'settings') {
            if (settings.key(code) === 'left') setZone('rail');
            return true;
        }
        if (state.zone === 'rail') {
            if (code === KEY.UP || code === KEY.DOWN) moveSection(code === KEY.UP ? -1 : 1);
            else if (code === KEY.RIGHT || code === KEY.ENTER) setZone(contentZone());
            else if (Keys.isBack(code)) hooks.exit();
            else return false;
        } else if (state.zone === 'categories') {
            var row = categories.item();
            if (row && row.virtual === 'discover' && (code === KEY.ENTER || code === KEY.RIGHT)) {
                Discover.open(state.section === 'movies' ? 'movie' : 'tv', { catalogue: tmdbCatalogue, open: openEntry });
                return true;
            }
            if (STEPS[code]) {
                if (categories.move(STEPS[code])) onCategoryMoved();
                else if (code === KEY.UP) enterToolbar('categories');
            } else if (code === KEY.LEFT || Keys.isBack(code)) setZone('rail');
            else if (code === KEY.ENTER && row && row.source) Keys.press(function () { setZone('items'); }, openSourceMenu);
            else if (code === KEY.ENTER && row && row.action) addSource(row.action);
            else if (code === KEY.ENTER && row && state.base) {
                Keys.press(function () {
                    enterCategory();
                }, function () {
                    openCategoryMenu(row);
                });
            }
            else if (code === KEY.RIGHT || code === KEY.ENTER) enterCategory();
            else return code === KEY.RIGHT || code === KEY.ENTER;
        } else {
            var grid = items.cols() > 1;
            if (STEPS[code]) {
                if (!moveItems(code) && code === KEY.UP) enterToolbar('items');
            } else if (grid && code === KEY.RIGHT) items.move(1);
            else if (grid && code === KEY.LEFT && items.index() % items.cols() !== 0) items.move(-1);
            else if (code === KEY.ENTER) {
                // Holding OK opens the options menu; a short press opens on release.
                if (state.section === 'sources') Keys.press(activateItem, openSourceMenu);
                else {
                    Keys.press(activateItem, function () {
                        openItemMenu(items.item(), state.section);
                    });
                }
            } else if (code === KEY.LEFT || Keys.isBack(code)) setZone('categories');
            else return false;
        }
        return true;
    }

    function start() {
        return LoadScreen.run('saved', function () {
            return Sources.current();
        }, function () { return true; }).then(startSource);
    }

    function startSource(source) {
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
        toast: toast,
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
            guide.resume(live.current());
        },
        live: live,
        epg: function () { return state.epg; },
        zap: live.zap,
    };
};
