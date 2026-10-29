// The main screen, laid out like IPTVnator on the desktop: a section rail,
// a source pill in the header, a category side list and the content list.
window.Browser = function (hooks) {
    'use strict';

    var KEY = Keys;
    // Header toolbar: search, the genre filter (Movies and Series), list,
    // grid, the Wide picture and Info boxes (Movies and Series, #66), then
    // Sort or the Live TV guide.
    var TOOLS = ['search', 'list', 'grid', 'wide', 'info', 'sort'];
    var BOXES = ['wide', 'info'];
    var STEPS = {};
    STEPS[KEY.UP] = -1;
    STEPS[KEY.DOWN] = 1;
    STEPS[KEY.CH_UP] = -10;
    STEPS[KEY.CH_DOWN] = 10;
    var SECTIONS = [
        { id: 'home', get label() { return I18n.t('rail.home'); }, icon: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z' },
        { id: 'live', get label() { return I18n.t('rail.live'); }, icon: 'M21 6h-7.59l3.29-3.29L16 2l-4 4-4-4-.71.71L10.59 6H3c-1.1 0-2 .89-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.11-.9-2-2-2zm0 14H3V8h18v12zM9 10v8l7-4z' },
        { id: 'movies', get label() { return I18n.t('rail.movies'); }, icon: 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z' },
        { id: 'series', get label() { return I18n.t('rail.series'); }, icon: 'M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z' },
        { id: 'settings', get label() { return I18n.t('rail.settings'); }, icon: 'M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.07-.94l2.03-1.58-1.92-3.32-2.39.96a7.1 7.1 0 0 0-1.62-.94L14.87 3h-3.74l-.36 3.18c-.59.24-1.13.56-1.62.94l-2.39-.96-1.92 3.32 2.03 1.58c-.05.31-.07.63-.07.94s.02.63.06.94l-2.02 1.58 1.92 3.32 2.39-.96c.49.38 1.03.7 1.62.94l.36 3.18h3.74l.36-3.18c.59-.24 1.13-.55 1.62-.94l2.39.96 1.92-3.32zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z' },
    ];
    var $ = function (id) {
        return document.getElementById(id);
    };
    var state = { section: 'settings', zone: 'settings', source: null, adapter: null, info: null, timer: null, catalogue: null, base: null, search: null, searching: false, searchTimer: null, tool: 0, toolFrom: 'items', played: false, favKeys: null, toastTimer: null, updating: 0, added: {}, epg: null, epgWanted: [], epgTimer: null, redrawTimer: null, guide: null, railAt: null, railTimer: null };
    // A section the menu passes opens only once the focus rests on it (#53).
    var RAIL_REST_MS = 200;
    var restoring = false;
    var account = Promise.resolve();
    var homeLoading = {};
    var visibility = Visibility(sourceId);
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
                return visibility.categories('live', list);
            });
        },
        // Zapping and last-channel lists apply the lock only, not hidden categories.
        channels: function (categoryId) {
            return loadCatalogue({ section: 'live', kind: 'items', id: categoryId }).then(function (list) {
                return visibility.items('live', list, { withHidden: true });
            });
        },
        allows: function (channel) { return visibility.allows('live', channel, { withHidden: true }); },
        request: liveRequest,
        record: function (channel) {
            record(channel, null, null, 'live');
            Library.setLastChannel(sourceId(), channel);
        },
    });
    Prefs.onChange(function (name) {
        if (name === 'programmeGuide') updateEpg();
        if (name === 'topBar' || name === 'menuPosition') renderChrome();
        // The rail and header show the new language at once.
        if (name === 'language') {
            renderChrome();
            if (state.section === 'settings') settings.render();
        }
    });
    ParentalLock.onChange(function () {
        // Recommendation rows were built for the old lock state.
        BecauseRows.invalidate();
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
    // "Go to Sources" on the account screen lands on the source with the
    // problem, in Settings > Sources (#51).
    LoadScreen.onSources(function () {
        libraryNavigation.cancel();
        var id = state.source && state.source.id;
        openSources(function (row) { return row.source && row.source.id === id; });
    });
    XmltvGuide.onChange(function (id) {
        if (state.section === 'settings') settings.render();
        if (!state.source || state.source.id !== id) return;
        if (state.guide) state.guide.stop();
        state.guide = Prefs.get('programmeGuide') ? GuideData(state.source, state.adapter) : null;
        if (state.section === 'live') items.select(items.index());
        else if (state.section === 'home') home.render();
    });
    var hideOn = !!Prefs.get('hideWatched');
    ProfileStore.onSwitch(function () { hideOn = !!Prefs.get('hideWatched'); });
    var watchedEmpty = false;
    var hiddenSnapshot = null;
    var visible = { list: [], empty: '' };
    var currentList = CurrentList(function () {
        return { section: state.section, base: !!state.base, category: categories.item(), loading: homeLoading };
    });
    var libraryRows = CategoryRows({
        ready: function () { return !!state.source; },
        section: function () { return state.section; },
        sortable: sortableSection,
        everySource: function () { return Prefs.get('librarySources') === 'all'; },
        chosenSort: function () { return Library.sort(sourceId(), state.section); },
        favorites: function () { return libraryList('favorites', state.section); },
        favoriteItems: function () { return Library.favoriteItems(sourceId(), state.section, state.catalogue.peek({ section: state.section, kind: 'items' }) || []); },
        recent: function () { return libraryList('recent', state.section); },
        continued: function () { return Library.continueWatching(sourceId(), state.section); },
        added: function () { return addedOf(state.section); },
    });
    // The films' collections (#58): a category under Movies and a detail row.
    var collections = Collections({
        sourceId: function () { return state.source ? sourceId() : null; },
        movies: collectionMovies,
        all: function () { return collectionMovies() && state.movieShelf.all; },
        changed: collectionsChanged,
    });
    var genres = GenreFilter({
        section: function () { return state.section; },
        ready: hasTools,
        candidates: function () { return visible.list; },
        tmdb: Tmdb,
        changed: function (listChanged) {
            if (listChanged) drawItems(items.index(), true);
            renderChrome();
        },
    });

    var categories = List($('categories'), {
        rows: 11,
        title: function () {
            return I18n.t('browser.categoriesOf', { section: sectionOf(state.section).label });
        },
        label: function (row) {
            return I18n.categoryName(row);
        },
        badge: function (row) {
            if (HiddenCategories.isReal(row) && ParentalLock.isLocked(sourceId(), state.section, row.category_id)) return '\ud83d\udd12';
            return row.count;
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
    var settings = Settings({ toast: toast, manage: openManage, hiddenText: hiddenText, profileChanged: profileChanged, chrome: renderChrome, sources: sourceHooks() });
    KidsProfile.setCatalogue(kidsCatalogue());
    var watched = Watched({
        knownShow: function (show) {
            if (otherSource(show)) return null;
            return state.catalogue.peek({ kind: 'show', id: show.series_id });
        },
        loadShow: loadShow,
        changed: function () {
            refreshLibrary();
            detail.refresh();
        },
        toast: toast,
    });
    // Search everything from Home: movies, series, then channels.
    var find = Find({
        sections: function () {
            return ['movies', 'series', 'live'].filter(available);
        },
        title: function (section) {
            return sectionOf(section).label;
        },
        items: function (section) {
            return state.catalogue.load({ section: section, kind: 'items' }, { screen: false }).then(function (all) {
                return visibility.items(section, all);
            });
        },
    });
    var home = Home({
        search: find.search,
        hero: function () {
            return state.adapter ? continueEntries().slice(0, 3) : [];
        },
        rows: function () {
            return state.adapter ? homeRows() : [];
        },
        open: function (entry) {
            openEntry(entry.item, entry.section);
        },
        resume: resumeEntry,
        openDetails: entryDetails,
        details: homeDetails,
        progress: progressOf,
        isNew: function (entry) {
            return !otherSource(entry.item) && entry.section === 'series' && NewEpisodes.isNew(sourceId(), entry.item, seriesList());
        },
        watched: function (entry) {
            return watched.isWatched(entry.item, entry.section);
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
            if (state.collection) return state.collection.found.label;
            if (currentList.showingSearch()) return I18n.t('browser.searchTitle', { query: state.search.query });
            var category = categories.item();
            return category ? I18n.categoryName(category) : '';
        },
        subtitle: sortSubtitle,
        decorate: decorate,
        label: itemLabel,
        // A collection's count, or the year of a film the provider lacks.
        sub: function (it) { return it.sub || (it.missing && it.year) || ''; },
        plate: function () {
            return state.section === 'live';
        },
        icon: function (it) {
            return it.stream_icon || it.cover || it.logo || null;
        },
        picture: BoxCards.picture,
        meta: function (it) { return BoxCards.meta(it, state.section); },
        action: function () {
            return refreshAvailable() ? { label: I18n.t('collections.refresh'), focused: state.refreshFocus } : null;
        },
        plot: function (it) { return BoxCards.plot(it, state.section); },
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
        if (category && category.virtual && !currentList.showingSearch()) {
            clearTimeout(state.timer);
            showVirtual(category, items.index());
        }
        guide.open({ guide: state.guide, channels: items.items().slice(), index: items.index(),
            title: currentList.showingSearch() ? I18n.t('browser.searchResults') : category ? I18n.categoryName(category) : I18n.t('browser.allChannels') });
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
        if (!state.source || item.collection) return;
        if (item.missing) return CollectionView.decorate(el, item);
        if (otherSource(item)) {
            var chip = document.createElement('span');
            chip.className = 'source-chip';
            chip.textContent = item.sourceName;
            el.appendChild(chip);
        }
        if (isFavorite(item)) {
            var star = document.createElement('span');
            star.className = 'star';
            star.textContent = '\u2605';
            el.appendChild(star);
        }
        if (state.section === 'live') {
            if (otherSource(item)) return;
            if (state.source.type === 'xtream') CatchUp.decorate(el, item);
            return showProgramme(el, item);
        }
        if (!otherSource(item) && state.section === 'series' && NewEpisodes.isNew(sourceId(), item, seriesList())) el.appendChild(NewEpisodes.badge());
        if (watched.isWatched(item, state.section)) {
            var tick = document.createElement('span');
            tick.className = 'watched-tick';
            tick.textContent = '\u2713';
            tick.setAttribute('aria-label', I18n.t('browser.watched'));
            el.appendChild(tick);
        }
        var p = Progress.of(Progress.id(state.section, item), item.sourceId);
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
        // Rows say when the programme ends; grid tiles have no room for it.
        if (label) {
            var left = document.createElement('span');
            left.className = 'epg-left';
            left.textContent = I18n.t('epg.minLeft', { m: Math.max(1, Math.round((now.end - Date.now()) / 60000)) });
            el.appendChild(left);
        }
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

    // The catalogue's categories minus the hidden ones, after the virtual rows;
    // Collections comes after Recently added.
    function categoryRows(list) {
        var rows = libraryRows.build().concat(visibility.categories(state.section, list || state.base || []));
        var shelf = state.section === 'movies' && collections.row();
        if (shelf) rows.splice(rows[1] && rows[1].virtual === 'added' ? 2 : 1, 0, shelf);
        if (!hideOn || !hideAvailable()) return rows;
        var all = state.catalogue.peek({ section: state.section, kind: 'items' }) || [];
        return hiddenList().counts(rows, visibility.items(state.section, all), function (row) {
            var cached = state.catalogue.peek({ section: state.section, kind: 'items', id: row.category_id });
            return cached && shownItems(row, cached);
        });
    }

    // keep: the focus stays on its row while rows come or go (Collections).
    function showCategories(index, keep) {
        hiddenSnapshot = null;
        state.movieShelf = null;
        var focused = keep && categories.item();
        var rows = categoryRows();
        if (focused) {
            var same = rows.map(function (row) { return String(row.category_id); }).indexOf(String(focused.category_id));
            if (same >= 0) index = same;
        }
        categories.set(rows, index, I18n.t('browser.noCategories'));
    }

    // The source's films as the collections see them: without hidden or
    // locked categories, worked out once per category list.
    function collectionMovies() {
        if (!state.catalogue || !state.adapter || state.adapter.sections.indexOf('movies') === -1) return null;
        var all = state.catalogue.peek({ section: 'movies', kind: 'items' });
        if (!all) return null;
        if (!state.movieShelf || state.movieShelf.all !== all) state.movieShelf = { all: all, list: visibility.items('movies', all) };
        return state.movieShelf.list;
    }

    // The look-up found something: the Collections row and its list follow,
    // at most every two seconds (it only runs while the remote rests).
    function collectionsChanged() {
        if (state.collectionsTimer) return;
        state.collectionsTimer = setTimeout(function () {
            state.collectionsTimer = null;
            if (state.section !== 'movies' || !state.base || state.searching) return;
            showCategories(categories.index(), true);
            var row = shownCategory();
            if (row && row.virtual === 'collections' && !state.collection) showVirtual(row, items.index());
        }, 2000);
    }

    // The Collections shelf's Refresh pill (#67): with a TMDB key, while the
    // shelf itself is shown. ▲ from its top row reaches it.
    function refreshAvailable() {
        var row = shownCategory();
        return state.section === 'movies' && !!row && row.virtual === 'collections' && !state.collection && Tmdb.enabled() && !currentList.showingSearch();
    }

    function focusRefresh(on) {
        state.refreshFocus = on;
        items.setActive(!on);
    }

    // Keys while the Refresh pill has the focus.
    function onRefreshKey(code) {
        if (code === KEY.ENTER) {
            collections.refresh();
            toast(I18n.t('collections.refreshing'));
        } else if (code === KEY.DOWN) focusRefresh(false);
        else if (code === KEY.UP) {
            focusRefresh(false);
            if (!enterToolbar('items') && menuOnTop()) setZone('rail');
        } else if (code === KEY.LEFT) setZone('categories');
        else if (Keys.isBack(code)) setZone('rail');
        else return false;
        return true;
    }

    // OK on a collection lists its films; Return goes back to the collections.
    function openCollection(entry) {
        var back = { list: visible.list, empty: visible.empty, raw: visible.raw, index: items.index() };
        setItems(collections.parts(entry.collection), 0, I18n.t('collections.empty'), true);
        state.collection = { found: entry.collection, back: back };
        // Drawn again so the header names the collection.
        items.select(0);
        renderChrome();
    }

    function closeCollection() {
        var back = state.collection.back;
        setItems(back.list, back.index, back.empty, back.raw);
        renderChrome();
    }

    // A film's collection row on its detail page.
    function filmCollection(movie, provider) {
        if (otherSource(movie)) return Promise.resolve(null);
        var lookup = Object.assign({}, movie, { year: provider.year || movie.year, tmdb_id: provider.tmdb_id || movie.tmdb_id || movie.tmdb });
        return (Tmdb.enabled() ? Tmdb.match(lookup, 'movie') : Promise.resolve(null)).then(function (body) {
            if (Tmdb.enabled() && !body) return null;
            return collections.forFilm(movie, body, tmdbCatalogue);
        }).then(function (found) {
            return found && CollectionView.row(found, function (item) { openEntry(item, 'movies'); });
        }).catch(function () { return null; });
    }

    // Recently added, without items of hidden categories.
    function addedOf(section) {
        return visibility.items(section, state.added[section] || []);
    }

    function showVirtual(category, index) {
        currentList.begin();
        applyView();
        // Library lists keep items of hidden categories; only the lock applies.
        // Collections are shown as they are: no genre, watched filter or sort.
        setItems(category.list().filter(function (item) {
            return visibility.allows(state.section, item, { sourceId: item.sourceId, withHidden: true });
        }), index || 0, category.empty, category.virtual === 'collections');
        renderChrome();
    }

    function record(item, show, episode, section) {
        if (episode) NewEpisodes.markSeen(sourceId(), show, seriesList());
        Library.addRecent(sourceId(), episode ? 'series' : section || state.section, item, show, episode);
        state.played = true;
    }

    // After playback or a favorite change: refresh counts and the open list.
    function refreshLibrary() {
        BecauseRows.invalidate();
        if (state.section === 'home') {
            state.favKeys = null;
            return home.render();
        }
        if (!state.adapter || !state.base) return;
        state.favKeys = null;
        showCategories(categories.index());
        var category = categories.item();
        if (category && category.virtual && !currentList.showingSearch()) showVirtual(category, items.index());
        else if (hideOn && hideAvailable()) drawItems(items.index(), true);
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
        if (!item) return;
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
                glyph: section === 'live' || item.episode ? '▶' : 'ℹ',
                run: function () {
                    openEntry(item, section);
                },
            },
        ];
        if (section === 'movies' && !item.episode) {
            options.push({
                label: I18n.t('menu.play'),
                glyph: '▶',
                run: function () {
                    playMovie(item);
                },
            });
        }
        var favorite = {
            label: I18n.t(isFavorite(item, section) ? 'menu.removeFavorite' : 'menu.addFavorite'),
            glyph: isFavorite(item, section) ? '☆' : '★',
            run: function () {
                toggleFavorite(item, section);
            },
        };
        options.push(favorite);
        var progressId = Progress.id(section, item);
        var progress = section === 'live' ? null : Progress.of(progressId, item.sourceId);
        if (progress && progress.status === 'continue') {
            options.push({
                label: I18n.t('menu.removeContinue'),
                glyph: '✕',
                run: function () {
                    Progress.clear(progressId, item.sourceId);
                    toast(I18n.t('toast.removedContinue'));
                    refreshLibrary();
                },
            });
        }
        if (Library.isRecent(item.sourceId || sourceId(), section, item)) {
            options.push({
                label: I18n.t('menu.removeRecent'),
                glyph: '✕',
                run: function () {
                    Library.removeRecent(item.sourceId || sourceId(), section, item);
                    toast(I18n.t('toast.removedRecent'));
                    refreshLibrary();
                },
            });
        }
        var header = {
            image: item.stream_icon || item.cover || item.logo || '',
            sub: [I18n.t(section === 'live' ? 'rail.live' : section === 'movies' ? 'rail.movies' : 'rail.series'), item.year].filter(Boolean).join('  ·  '),
        };
        // A kids profile (#62) keeps Favorite and Mark watched only.
        if (KidsProfile.on()) options = [favorite];
        if (otherSource(item)) Menu.open(itemLabel(item), options, 0, header);
        else watched.openItemMenu(item, section, options, itemLabel(item), header);
    }

    function viewMode() {
        return Library.view(state.section, state.section === 'live' ? 'list' : 'grid');
    }

    function applyView() {
        var mode = viewMode();
        items.setGrid(mode !== 'list', BOXES.indexOf(mode) !== -1 ? mode : '');
    }

    function setView(mode) {
        Library.setView(state.section, mode);
        applyView();
        renderChrome();
    }

    // ---- Header toolbar and search ----

    function sortableSection() {
        return state.source && state.source.type === 'xtream' && (state.section === 'movies' || state.section === 'series');
    }

    // The category under the cursor, unless search results are showing.
    function shownCategory() {
        return !currentList.showingSearch() && categories.item();
    }

    function sortMode() {
        return libraryRows.sortMode(shownCategory());
    }

    function sortSubtitle() {
        if (state.collection) return state.collection.found.sub;
        var row = shownCategory();
        if (row && row.virtual === 'collections') return collections.progress();
        var mode = sortMode();
        var option = Sort.options.filter(function (entry) {
            return entry.id === mode;
        })[0];
        return option ? I18n.t('browser.sortedBy', { sort: option.label.toLowerCase() }) : '';
    }

    // raw: shown as it is, without the genre, watched filter or sort.
    function setItems(list, index, empty, raw) {
        hiddenSnapshot = null;
        state.collection = null;
        visible = { list: list, empty: empty, raw: !!raw };
        if (!raw) genres.look();
        drawItems(index);
    }

    // The list with the genre pill applied; keep holds the focused title.
    function drawItems(index, keep) {
        if (visible.raw) {
            watchedEmpty = false;
            return items.set(visible.list.slice(), keep ? Math.max(0, indexIn(visible.list, items.item(), index)) : index, visible.empty);
        }
        var mode = sortMode();
        var view = genres.apply(visible.list, visible.empty);
        var filtered = hideOn && hideAvailable() && !currentList.showingSearch() ? hiddenList().filter(view.list) : view.list;
        watchedEmpty = view.list.length > 0 && filtered.length === 0;
        if (watchedEmpty) view.empty = [I18n.t('empty.watched.title'), '', { label: I18n.t('browser.showWatched'), run: toggleWatched }];
        var shown = mode ? Sort.order(filtered, state.section, mode) : filtered.slice();
        items.set(shown, keep ? Math.max(0, indexIn(shown, items.item(), index)) : index, view.empty);
    }

    // A movie's own page carries its genre; pages already opened count.
    Genres.usePage(function (item, section) {
        var page = section === 'movies' && state.catalogue && item.stream_id !== undefined && state.catalogue.peek({ kind: 'movie', id: item.stream_id });
        return page ? page.genre : '';
    });

    // ---- Genre filter (#31) ----

    // The filter button beside the search bar in Movies and Series opens a
    // menu: All and the section's most common genres. A genre narrows
    // whatever list is showing. ▼ at the end of the list or CH▼ checks the
    // next titles for it.
    function loadGenres(section) {
        var adapter = state.adapter;
        genres.offer(section, function () {
            return state.catalogue.load({ section: section, kind: 'items' }, { screen: false }).then(function (all) {
                // The films are in: the collections can be found and shown.
                if (section === 'movies' && adapter === state.adapter) collections.start();
                if ((hideOn || section === 'movies') && adapter === state.adapter && state.section === section) showCategories(categories.index(), true);
                return adapter === state.adapter ? visibility.items(section, all) : null;
            });
        });
    }

    function pickGenre(name) {
        genres.pick(name);
        setItems(visible.list, 0, visible.empty);
        setZone(items.items().length ? 'items' : 'categories');
    }

    function openGenreMenu() {
        var chosen = genres.current();
        var names = genres.names();
        var mark = function (name) { return (name === chosen ? '✓ ' : '') + (name || I18n.t('find.all')); };
        var options = [null].concat(names).map(function (name) {
            return { label: mark(name), run: function () { pickGenre(name); } };
        });
        var left = genres.pending();
        if (left) {
            options.push({ label: I18n.t('find.checkMore', { n: left }), run: function () { genres.more(); setZone(items.items().length ? 'items' : 'categories'); } });
        }
        Menu.open(I18n.t('find.genre'), options, Math.max(0, names.indexOf(chosen) + 1));
    }

    function hideAvailable() {
        return state.section === 'movies' || state.section === 'series';
    }

    function hiddenList() {
        return hiddenSnapshot || (hiddenSnapshot = HideWatched(watched, state.section));
    }

    function toggleWatched() {
        hideOn = !hideOn;
        Prefs.set('hideWatched', hideOn);
        showCategories(categories.index());
        drawItems(items.index(), true);
        renderChrome();
    }

    function toolbarTools() {
        var sort = libraryRows.canSort(shownCategory());
        var tools = TOOLS.filter(function (tool) {
            return tool === 'sort' ? sort : BOXES.indexOf(tool) === -1 || state.section !== 'live';
        });
        if (hideAvailable()) tools = tools.concat(['hide-watched']);
        if (genres.names().length) tools = ['search', 'genre'].concat(tools.slice(1));
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
        return !!state.base;
    }

    function enterToolbar(from) {
        if (!hasTools()) return false;
        state.toolFrom = from;
        state.tool = 0;
        setZone('toolbar');
        return true;
    }

    // ▼ from the toolbar: search results take the focus whenever there are
    // any; otherwise back where the toolbar was entered from.
    function leaveToolbar() {
        var results = currentList.showingSearch() && items.items().length;
        var back = (results || state.toolFrom === 'items') && (items.items().length || watchedEmpty) ? 'items' : 'categories';
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
            if (currentList.showingSearch()) loadItems();
            return Promise.resolve(0);
        }
        var token = currentList.beginSearch();
        state.search = { section: section, query: query, results: [] };
        applyView();
        // In Collections the bar finds collections by name: nothing is asked.
        var shelf = categories.item();
        if (shelf && shelf.virtual === 'collections') {
            state.search.results = Find.rank(shelf.list(), section, query);
            setItems(state.search.results, 0, [I18n.t('empty.search.title', { query: query }), I18n.t('collections.searchHint')], true);
            renderChrome();
            return Promise.resolve(state.search.results.length);
        }
        items.loading();
        return loadCatalogue({ section: section, kind: 'items' })
            .then(function (all) {
                if (!currentList.isActive(token)) return 0;
                // Best matches first, like Home's search; no cap here.
                state.search.results = Find.rank(visibility.items(section, all), section, query);
                setItems(state.search.results, 0, [I18n.t('empty.search.title', { query: query }), I18n.t('empty.search.hint')]);
                renderChrome();
                return state.search.results.length;
            })
            .catch(function (err) {
                if (currentList.isActive(token)) fail(items, 'SEARCH')(err);
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
        else if (Keys.isBack(code) || towardMenu(code)) setZone('rail');
        else if (code === KEY.DOWN) leaveToolbar();
        else if (code === KEY.ENTER && tool === 'search') startTyping();
        else if (code === KEY.ENTER && tool === 'hide-watched') toggleWatched();
        else if (code === KEY.ENTER && tool === 'sort') openSortMenu();
        else if (code === KEY.ENTER && tool === 'genre') openGenreMenu();
        else if (code === KEY.ENTER && tool === 'guide') openGuide();
        else if (code === KEY.ENTER) setView(tool);
        else return code === KEY.UP || code === KEY.RIGHT;
        renderChrome();
        return true;
    }

    // The main menu is a rail on the left or a bar along the top (#50).
    function menuOnTop() {
        return Prefs.get('menuPosition') === 'top';
    }

    // The key that steps from the edge of a screen onto the menu.
    function towardMenu(code) {
        return code === (menuOnTop() ? KEY.UP : KEY.LEFT);
    }

    function sectionOf(id) {
        return SECTIONS.filter(function (s) {
            return s.id === id;
        })[0];
    }

    // A kids profile (#62) has no Settings and only sections with ticked categories.
    function available(id) {
        if (id === 'home') return !!state.adapter;
        if (id === 'settings') return !KidsProfile.on();
        return !!state.adapter && state.adapter.sections.indexOf(id) !== -1 && KidsProfile.any(sourceId(), id);
    }

    function loadCatalogue(what, onFresh) {
        return state.catalogue.load(what, {
            screen: !Player.isOpen() || hooks.preview.active(),
            active: function () { return currentList.wants(what); },
            onFresh: onFresh,
        });
    }

    // Position of `item` in a refreshed list, matched by provider id.
    function indexIn(list, item, fallback) {
        var id = item && (item.stream_id || item.series_id || item.category_id || item.id || item.url);
        for (var i = 0; id !== undefined && i < list.length; i++) {
            var other = list[i];
            if ((other.stream_id || other.series_id || other.category_id || other.id || other.url) === id && (other.sourceId || '') === (item.sourceId || '')) return i;
        }
        return fallback;
    }

    function renderChrome() {
        LoadScreen.render();
        document.body.classList.toggle('menu-top', menuOnTop());
        $('rail').innerHTML = '';
        var at = railAt();
        SECTIONS.forEach(function (section) {
            if (section.id === 'settings' && KidsProfile.on()) return;
            var el = document.createElement('div');
            el.className =
                'rail-item' +
                (section.id === state.section ? ' active' : '') +
                (section.id === at && state.zone === 'rail' && !state.profileFocus ? ' focused' : '') +
                (section.id === 'settings' ? ' rail-bottom' : '') +
                (available(section.id) ? '' : ' disabled');
            el.innerHTML =
                '<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="' + section.icon + '"/></svg><span></span>';
            el.lastChild.textContent = section.label;
            $('rail').appendChild(el);
        });
        RailProfile.render($('rail'), state.zone === 'rail' && state.profileFocus);
        // The source is switched in Settings > Sources (#45); the page keeps
        // its name for diagnostics and tests.
        document.body.setAttribute('data-source', state.source ? state.source.name : '');
        renderToolbar();
        // No key hints: the chip shows only work in progress, such as a
        // catalogue refresh (with the source pill gone, #45) or a genre check.
        $('status').textContent = [state.updating ? I18n.t('browser.updating') : '', genres.hint()]
            .filter(Boolean)
            .join('  ·  ');
    }

    function renderToolbar() {
        var on = hasTools();
        var tools = toolbarTools();
        state.tool = Math.min(state.tool, tools.length - 1);
        var focus = state.zone === 'toolbar' ? tools[state.tool] : null;
        $('header').classList.toggle('no-tools', !on);
        // The bar shows only where it does something; with Top bar Off it
        // comes up over the list while the remote is on it.
        var off = Prefs.get('topBar') === 'off';
        document.body.classList.toggle('no-bar', !on || (off && state.zone !== 'toolbar'));
        document.body.classList.toggle('bar-off', off);
        $('searchbar').classList.toggle('focused', focus === 'search');
        var input = $('search-input');
        input.placeholder = on ? I18n.t('browser.searchIn', { section: sectionOf(state.section).label }) : I18n.t('browser.search');
        if (!state.searching) input.value = currentList.showingSearch() ? state.search.query : '';
        Array.prototype.forEach.call(document.querySelectorAll('#view-toggle .view-btn'), function (btn) {
            var mode = btn.getAttribute('data-mode');
            if (mode === 'hide-watched') {
                btn.classList.toggle('hidden', !on || !hideAvailable());
                btn.classList.toggle('chosen', hideOn);
                btn.setAttribute('aria-pressed', String(hideOn));
                btn.textContent = I18n.t('browser.hideWatched') + ': ' + I18n.t(hideOn ? 'common.on' : 'common.off');
            }
            if (mode === 'sort' || BOXES.indexOf(mode) !== -1) btn.classList.toggle('hidden', !on || tools.indexOf(mode) === -1);
            if (mode === 'guide') btn.classList.toggle('hidden', !guideAvailable());
            if (mode === 'genre') {
                // The genre in use shows on the button.
                btn.classList.toggle('hidden', tools.indexOf('genre') === -1);
                var picked = genres.current();
                btn.classList.toggle('chosen', !!picked);
                btn.lastChild.textContent = picked || '';
            }
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
        if (zone !== 'rail') state.profileFocus = false;
        state.refreshFocus = false;
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

    // ---- Sources, in Settings (#51) ----

    // Opens Settings with the focus on the first row `match` accepts.
    function openSources(match) {
        openSection('settings');
        settings.select(match);
        setZone('settings');
    }

    // The source becomes the current one and its Home opens.
    function watch(source) {
        setSource(source);
        openSection('home');
        setZone(contentZone());
    }

    // `change` is what SourceEdit already saved; this brings the screen in line with it.
    function sourceEdited(change) {
        var updated = change.source;
        var current = state.source && state.source.id === change.previousId;
        if (change.reconnect && current) {
            (change.rekeyed ? Promise.resolve() : state.catalogue.drop()).then(function () {
                setSource(updated);
                settings.render();
            });
        } else if (change.reconnect) {
            Catalogue.drop(updated.id);
        } else if (current) {
            state.source = updated;
            updateEpg();
        }
        settings.render();
        renderChrome();
    }

    function sourceHooks() {
        return {
            current: function () { return state.source; },
            info: function () { return state.info; },
            use: watch,
            refresh: function (source) {
                // Forget the saved lists; the next section opened reloads them.
                var dropping = state.source && source.id === sourceId() ? state.catalogue.drop() : Catalogue.drop(source.id);
                dropping.then(function () {
                    toast(I18n.t('toast.reloading', { name: source.name }));
                    watch(source);
                });
            },
            edit: function (source) {
                SourceEdit(source, { openForm: hooks.openForm, saved: sourceEdited })();
            },
            guide: function (source) {
                return SourceGuide(source, { openForm: hooks.openForm, changed: function (updated) {
                    if (state.source && state.source.id === updated.id) {
                        state.source = updated;
                        updateEpg();
                    }
                    settings.render();
                } });
            },
            remove: function (source) {
                Sources.remove(source.id);
                Catalogue.drop(source.id);
                if (state.source && state.source.id === source.id) setSource(Sources.current());
                settings.render();
                renderChrome();
            },
            add: function (kind) {
                hooks.openForm(kind, function (source) {
                    if (source) watch(Sources.add(source));
                    else setZone('settings');
                });
            },
        };
    }

    // ---- Content sections ----

    function setSource(source, screenReady) {
        hooks.preview.stop();
        if (state.catalogue) state.catalogue.dispose();
        state.catalogue = null;
        LoadScreen.reset();
        currentList.begin();
        live.reset();
        restoring = false;
        state.source = source;
        state.adapter = null;
        updateEpg();
        state.info = null;
        state.base = null;
        state.search = null;
        state.favKeys = null;
        state.added = {};
        genres.reset();
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
            return adapter === state.adapter && state.section !== 'settings' && (!screenReady || screenReady());
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
                if (state.section === 'settings') settings.render();
            });
        var checked = account;
        state.catalogue = CatalogueLoader({
            adapter: adapter,
            sourceId: source.id,
            store: Catalogue,
            // When each list was last fetched: lists refresh once a day, or
            // from Settings > Sources > Refresh content now.
            stamps: {
                get: function (key) {
                    try {
                        return Number(Stored.text('iptvnator-tv:fetched:' + source.id + ':' + key)) || 0;
                    } catch (e) {
                        return 0;
                    }
                },
                set: function (key) {
                    try {
                        Stored.put('iptvnator-tv:fetched:' + source.id + ':' + key, String(Date.now()));
                    } catch (e) {
                        // Storage full: the list refreshes next start.
                    }
                },
            },
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
        clearTimeout(state.railTimer);
        state.railAt = null;
        if (id !== 'live') hooks.preview.stop();
        state.section = id;
        clearTimeout(state.timer);
        clearTimeout(state.searchTimer);
        $('content').classList.toggle('home', id === 'home');
        $('content').classList.toggle('settings', id === 'settings');
        state.base = null;
        genres.cancel();
        state.favKeys = null;
        var token = currentList.begin();
        applyView();
        items.set([], 0, '');
        if (id === 'home') return showHome();
        if (id === 'settings') {
            settings.render();
            // The Sources group shows each source's state once it is checked.
            SourceAccount.refresh(Sources.all(), function () {
                if (state.section === 'settings') settings.render();
            });
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
                if (!currentList.isActive(token)) return;
                state.base = list;
                // The first provider category, after the library rows and Collections.
                showCategories(categoryRows().filter(function (row) { return row.virtual || row.all; }).length);
                loadItems();
                if (sortableSection()) loadRecentlyAdded(id);
                if (id === 'movies' || id === 'series') loadGenres(id);
            })
            .catch(function (err) {
                if (currentList.isActive(token)) fail(categories, 'CATEGORIES')(err);
            });
    }

    // "All channels" spans categories; any other list is just its own category.
    function shownItems(category, list) {
        return visibility.items(state.section, list, { withHidden: String(category.category_id) !== '' });
    }

    function loadItems() {
        var category = categories.item();
        if (!category) return;
        if (category.virtual) return showVirtual(category);
        if (ParentalLock.isLocked(sourceId(), state.section, category.category_id) && !ParentalLock.isUnlocked()) {
            currentList.begin();
            setItems([], 0, [I18n.t('empty.locked.title'), I18n.t('empty.locked.hint')]);
            return renderChrome();
        }
        var section = state.section;
        var token = currentList.begin();
        applyView();
        items.loading();
        renderChrome();
        loadCatalogue(
            { section: section, kind: 'items', id: category.category_id },
            function (list) {
                if (!currentList.isActive(token)) return;
                var item = items.item();
                var index = items.index();
                setItems(shownItems(category, list), 0, I18n.t('empty.category.title'));
                items.select(Math.max(0, Math.min(items.items().length - 1, indexIn(items.items(), item, index))));
            }
        )
            .then(function (list) {
                if (currentList.isActive(token)) setItems(shownItems(category, list), 0, [I18n.t('empty.category.title'), I18n.t('empty.category.hint')]);
            })
            .catch(function (err) {
                if (currentList.isActive(token)) fail(items, 'ITEMS')(err);
            });
    }

    // An episode request that knows the whole show, so the player can offer
    // Next episode, autoplay and the episodes panel. Opening another episode
    // from the player records it like a pick from the list.
    function episodeRequest(show, list, index) {
        var req = state.adapter.episodeRequest(show, list[index]);
        SubtitleContext.attach(req, { sourceId: sourceId(), item: show, episode: list[index], catalogue: state.catalogue, details: detail.subtitleInfo(show) });
        req.episodes = {
            items: list,
            index: index,
            // Names the show for what the player learns about it (its intro's end).
            show: sourceId() + '|' + (show.series_id || show.name || ''),
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
            if (!req.subtitleLookup) SubtitleContext.attach(req, { sourceId: sourceId(), item: show, episode: entry.episode, catalogue: state.catalogue });
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
        return Progress.of(Progress.id(entry.section, entry.item), entry.item.sourceId);
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
            return visibility.allows(entry.section, entry.item, { withHidden: true });
        }).sort(function (a, b) {
            return progressOf(b).updatedAt - progressOf(a).updatedAt;
        });
    }

    // Home rows leave out items of hidden categories (Continue watching stays).
    function shownEntries(section, list) {
        return entriesOf(section, list.filter(function (item) {
            return visibility.allows(section, item, { sourceId: item.sourceId });
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
        ].concat(becauseRows(), [
            { id: 'new-movies', title: I18n.t('home.newMovies'), entries: entriesOf('movies', addedOf('movies')), loading: homeLoading.movies },
            { id: 'new-series', title: I18n.t('home.newSeries'), entries: entriesOf('series', addedOf('series')), loading: homeLoading.series },
            { id: 'recent-live', title: I18n.t('home.recentLive'), entries: shownEntries('live', libraryList('recent', 'live')) },
        ]);
    }

    // "Because you watched" (#63), from the lists saved after playback and on
    // detail pages: Home itself never asks TMDB.
    function becauseRows() {
        return BecauseRows.rows(sourceId(), function (section, item) {
            return available(section) && visibility.allows(section, item, { sourceId: item.sourceId }) && !watched.isWatched(item, section);
        }).map(function (row) {
            return {
                id: 'because-' + row.section,
                title: I18n.t('home.because', { title: row.title.name }),
                pill: I18n.t(row.section === 'movies' ? 'home.pillMovie' : 'home.pillShow'),
                entries: entriesOf(row.section, row.items),
            };
        });
    }

    // After playback: finds TMDB's similar titles for the latest movie and
    // show watched, when their saved lists are missing or a week old.
    function learnSimilar() {
        if (!Tmdb.enabled() || !state.adapter) return;
        var adapter = state.adapter;
        var id = sourceId();
        BecauseRows.wanted(id).forEach(function (title) {
            var type = title.section === 'movies' ? 'movie' : 'tv';
            Tmdb.match(title.item, type).then(function (body) {
                if (!body || adapter !== state.adapter) return null;
                return tmdbCatalogue().then(function (catalogue) {
                    if (adapter !== state.adapter) return;
                    var credits = ((body.similar || {}).results || []).map(function (entry) { return Object.assign({}, entry, { media_type: type }); });
                    var found = Tmdb.inLibrary(credits, catalogue).filter(function (entry) { return entry.type === type; });
                    BecauseRows.save(id, title.section, title.item, BecauseRows.ordered(found, credits));
                    if (state.section === 'home') home.render();
                });
            }).catch(function (err) {
                Log.error('BECAUSE FAIL ' + (err && err.message));
            });
        });
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
        if (category && !currentList.showingSearch() && category.fromCatalogue) {
            showVirtual(categories.item(), items.index());
        }
        // Badges follow the refreshed dates in every list of shows.
        if (section === 'series' && items.items().length) items.select(items.index());
        renderChrome();
    }

    function showHome() {
        BecauseRows.invalidate();
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
        SubtitleContext.attach(req, { sourceId: sourceId(), item: movie, catalogue: state.catalogue, details: detail.subtitleInfo(movie) });
        if (resume !== undefined) req.resume = resume;
        hooks.play(req);
    }

    // "More in <category>" on a detail page (#47): the other titles of the
    // item's category from the section's saved list, so no new request.
    function relatedTitles(item, section) {
        var id = item.category_id;
        if (otherSource(item) || id === undefined || id === null || String(id) === '') return Promise.resolve(null);
        var load = function (kind) {
            return state.catalogue.load({ section: section, kind: kind }, { screen: false });
        };
        var key = function (entry) { return String(entry.stream_id || entry.series_id || entry.url || entry.name); };
        return Promise.all([load('categories'), load('items')]).then(function (lists) {
            var category = lists[0].filter(function (row) { return String(row.category_id) === String(id); })[0];
            if (!category) return null;
            var shown = visibility.items(section, lists[1]);
            var others = shown.filter(function (entry) { return String(entry.category_id) === String(id) && key(entry) !== key(item); });
            return { label: I18n.t('detail.moreIn', { category: I18n.categoryName(category) }), items: others.slice(0, 20) };
        }).catch(function () { return null; });
    }

    function openMovie(movie) {
        detail.open({
            item: movie,
            catalogue: tmdbCatalogue,
            similarFound: keepSimilar.bind(null, 'movies', movie),
            related: relatedTitles.bind(null, movie, 'movies'),
            collection: filmCollection.bind(null, movie),
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
        // The page still names new episodes it was opened for (#46).
        var fresh = !otherSource(show) && NewEpisodes.isNew(sourceId(), show, seriesList());
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
            similarFound: keepSimilar.bind(null, 'series', show),
            related: relatedTitles.bind(null, show, 'series'),
            open: openEntry,
            episodes: episodes,
            badges: fresh ? [I18n.t('home.newEpisodes')] : [],
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

    // A detail page's similar titles also feed "Because you watched" (#63).
    function keepSimilar(section, item, items) {
        if (!otherSource(item)) BecauseRows.save(sourceId(), section, item, items);
    }

    function tmdbCatalogue() {
        return Promise.all(['movies', 'series'].map(function (section) {
            if (state.adapter.sections.indexOf(section) === -1) return [];
            return state.catalogue.load({ section: section, kind: 'items' }, { screen: false }).then(function (list) {
                return visibility.items(section, list).map(function (item) {
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
        if (item.collection) return openCollection(item);
        if (item.missing) return toast(I18n.t('collections.notAvailableHint'));
        if (otherSource(item)) return openEntry(item, state.section);
        // OK on a channel previews it beside the list (see live-preview.js).
        if (state.section === 'live' && !item.episode && hooks.preview.open(item, items.items().filter(function (channel) { return !otherSource(channel); }))) return;
        openEntry(item, state.section);
    }

    // ---- Keys ----

    // The section the menu's focus is on.
    function railAt() {
        return state.railAt || state.section;
    }

    // Moving along the menu only moves its focus: the section opens once the
    // focus rests, so passing Live TV and Movies on the way to Settings does
    // not load them (#53). Returns false at either end.
    function moveSection(delta) {
        var index = SECTIONS.indexOf(sectionOf(railAt()));
        for (var i = index + delta; i >= 0 && i < SECTIONS.length; i += delta) {
            if (available(SECTIONS[i].id)) {
                state.railAt = SECTIONS[i].id;
                clearTimeout(state.railTimer);
                state.railTimer = setTimeout(settleRail, RAIL_REST_MS);
                renderChrome();
                return true;
            }
        }
        return false;
    }

    // Opens the section the menu's focus rests on.
    function settleRail() {
        clearTimeout(state.railTimer);
        var id = state.railAt;
        state.railAt = null;
        if (!id || id === state.section) return renderChrome();
        openSection(id);
        if (state.zone === 'rail') setZone('rail');
    }

    function onCategoryMoved() {
        clearTimeout(state.timer);
        state.timer = setTimeout(loadItems, 350);
        renderChrome();
    }

    // ---- Profiles ----

    // Another profile is active: stop playback and reload the Home of the
    // current source from that profile's library.
    function profileChanged() {
        var source = KidsProfile.source(Sources.current());
        if (source) return watch(source);
        setSource(null);
        if (KidsProfile.on()) return kidsWithoutSource();
        openSources(addRow);
    }

    // What "What can <name> watch?" ticks (#62): the open source's lists as
    // browsing loads them, other sources only from what the app already saved.
    function kidsCatalogue() {
        function open(source) {
            return !!state.adapter && !!state.source && state.source.id === source.id;
        }
        function saved(source, key) {
            return Catalogue.get(source.id, key).then(function (list) { return Array.isArray(list) ? list : null; });
        }
        return {
            sections: function (source) {
                return open(source) ? state.adapter.sections.slice() : KidsProfile.sections.slice();
            },
            categories: function (source, section) {
                var list = open(source) ? state.catalogue.load({ section: section, kind: 'categories' }, { screen: false }) : saved(source, section + ':categories');
                return list.then(function (rows) { return (rows || []).filter(HiddenCategories.isReal); }, function () { return []; });
            },
            // Items per category, only when the whole list is already saved.
            counts: function (source, section) {
                var cached = open(source) && state.catalogue.peek({ section: section, kind: 'items' });
                return (cached ? Promise.resolve(cached) : saved(source, section + ':items:')).then(function (items) {
                    if (!items) return null;
                    var counts = {};
                    items.forEach(function (item) {
                        var id = HiddenCategories.categoryOf(item);
                        counts[id] = (counts[id] || 0) + 1;
                    });
                    return counts;
                });
            },
        };
    }

    // A kids profile with nothing ticked anywhere: the menu and a note, no Settings.
    function kidsWithoutSource() {
        // An empty Home: never the grown-up's screen (Settings) left open.
        state.section = 'home';
        $('content').classList.add('home');
        $('content').classList.remove('settings');
        setZone('rail');
        renderChrome();
        toast(I18n.t('kids.nothing'));
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
        if (KidsProfile.on()) return;
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
        if (items.items().length || watchedEmpty) setZone('items');
    }

    // After hiding or showing categories: redraw the list. A category that
    // went away hands the focus to the next one, whose items then open.
    function categoriesChanged(section) {
        if (state.section === 'settings') return settings.render();
        if (state.section !== section || !state.base) return;
        showCategories(indexIn(categoryRows(), categories.item(), categories.index()));
        if (currentList.showingSearch()) runSearch();
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

    // Home's Continue watching plays on from where it stopped, without the
    // Resume question; its details are a hold-OK away.
    function resumeEntry(entry) {
        if (entry.item.episode) playSavedEpisode(entry.item, true);
        else playMovie(entry.item, true);
    }

    function entryDetails(entry) {
        if (entry.item.episode) openShow(entry.item.show);
        else openMovie(entry.item);
    }

    function onHomeKey(code) {
        if (home.typing()) return home.key(code);
        if (Keys.isBack(code) && home.back()) return true;
        var entry = home.focused();
        if (code === KEY.ENTER && entry) {
            var resumes = home.inContinue() && !otherSource(entry.item);
            Keys.press(
                function () {
                    if (resumes) resumeEntry(entry);
                    else openEntry(entry.item, entry.section);
                },
                function () {
                    if (resumes) entryDetails(entry);
                    else openItemMenu(entry.item, entry.section);
                }
            );
        } else if (Keys.isBack(code) || leavesFor(home.key(code))) setZone('rail');
        // Home redraws itself; the chrome only when the focus left it.
        if (state.zone !== 'home') renderChrome();
        return true;
    }

    // A screen reports the edge the focus left by: 'left' or 'up'. Only the
    // edge that faces the menu leads to it.
    function leavesFor(edge) {
        return edge === (menuOnTop() ? 'up' : 'left');
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
            var edge = settings.key(code);
            if (edge === 'back' || leavesFor(edge)) setZone('rail');
            return true;
        }
        // Along the menu: ▲/▼ on the side, ◀/▶ on top; the profile is first.
        var prev = menuOnTop() ? KEY.LEFT : KEY.UP;
        var next = menuOnTop() ? KEY.RIGHT : KEY.DOWN;
        var enter = menuOnTop() ? KEY.DOWN : KEY.RIGHT;
        if (state.zone === 'rail' && state.profileFocus) {
            if (code === next || code === enter) {
                state.profileFocus = false;
                renderChrome();
            } else if (code === KEY.ENTER) {
                RailProfile.open(profileChanged, function () {
                    state.profileFocus = false;
                    openSection('settings');
                    setZone('settings');
                });
            } else if (Keys.isBack(code)) hooks.exit();
            else return code === prev;
        } else if (state.zone === 'rail') {
            if (code === prev || code === next) {
                // Back past the first section reaches the profile avatar.
                if (!moveSection(code === prev ? -1 : 1) && code === prev) {
                    settleRail();
                    state.profileFocus = true;
                    renderChrome();
                }
            } else if (code === enter || code === KEY.ENTER) {
                settleRail();
                // A section the profile cannot open keeps the focus in the menu.
                if (available(state.section)) setZone(contentZone());
            }
            else if (Keys.isBack(code)) hooks.exit();
            else return false;
        } else if (state.zone === 'categories') {
            var row = categories.item();
            if (STEPS[code]) {
                if (categories.move(STEPS[code])) onCategoryMoved();
                else if (code === KEY.UP && !enterToolbar('categories') && menuOnTop()) setZone('rail');
            } else if (towardMenu(code) || Keys.isBack(code)) setZone('rail');
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
            if (state.refreshFocus) return onRefreshKey(code);
            if (STEPS[code]) {
                var moved = moveItems(code);
                if (!moved && code === KEY.UP && refreshAvailable()) focusRefresh(true);
                else if (!moved && code === KEY.UP && !enterToolbar('items') && menuOnTop()) setZone('rail');
                else if (!moved && (code === KEY.DOWN || code === KEY.CH_DOWN)) genres.more();
            } else if (grid && code === KEY.RIGHT) items.move(1);
            else if (grid && code === KEY.LEFT && items.index() % items.cols() !== 0) items.move(-1);
            else if (code === KEY.ENTER && watchedEmpty) toggleWatched();
            else if (code === KEY.ENTER) {
                // Holding OK opens the options menu; a short press opens on release.
                Keys.press(activateItem, function () {
                    var held = items.item();
                    if (held && !held.collection && !held.missing) openItemMenu(held, state.section);
                });
            } else if (Keys.isBack(code) && state.collection) closeCollection();
            else if (Keys.isBack(code)) setZone('rail');
            else if (code === KEY.LEFT) setZone('categories');
            else return false;
        }
        return true;
    }

    function addRow(row) {
        return row.add === 'xtream';
    }

    function start() {
        return LoadScreen.run('saved', function () {
            return KidsProfile.source(Sources.current());
        }, function () { return true; }).then(startSource);
    }

    function startSource(source) {
        setSource(source);
        if (!source && KidsProfile.on()) return kidsWithoutSource();
        // With no source yet, Settings opens on Add source (#51).
        if (!source) return openSources(addRow);
        openSection('home');
        setZone(contentZone());
        restoring = true;
        live.last(source.id).then(function (channel) {
            if (restoring && channel) hooks.play(live.play(channel));
            restoring = false;
        }).catch(function () {
            restoring = false;
            Log.error('LAST CHANNEL FAIL');
        });
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
            learnSimilar();
            // Zapping does not move the list; land on the channel watched last.
            var at = state.section === 'live' && !currentList.showingSearch() ? live.indexOf(items.items(), live.current()) : -1;
            if (at >= 0) items.select(at);
            detail.refresh();
            guide.resume(live.current());
        },
        live: live,
        epg: function () { return state.epg; },
        zap: live.zap,
        // The screen saver's titles (#61): only details already loaded, so
        // it never sends a request.
        saverSlides: function () {
            if (!state.adapter) return [];
            return ScreenSaver.slides(homeRows(), {
                progress: progressOf,
                details: function (entry) {
                    if (otherSource(entry.item)) return null;
                    if (entry.item.episode || entry.section === 'series') {
                        var show = entry.item.show || entry.item;
                        var info = state.catalogue.peek({ kind: 'show', id: show.series_id });
                        return info && info.details;
                    }
                    return state.catalogue.peek({ kind: 'movie', id: entry.item.stream_id });
                },
            });
        },
    };
};
