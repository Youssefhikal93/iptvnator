// The main screen, laid out like IPTVnator on the desktop: a section rail,
// a source pill in the header, a category side list and the content list.
window.Browser = function (hooks) {
    'use strict';

    var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, RETURN: 10009, BACKSPACE: 8, ESCAPE: 27 };
    var STEPS = { 38: -1, 40: 1, 427: -10, 428: 10 };
    var SECTIONS = [
        { id: 'sources', label: 'Sources', glyph: '≡' },
        { id: 'live', label: 'Live TV', glyph: '▶' },
        { id: 'movies', label: 'Movies', glyph: '▣' },
        { id: 'series', label: 'Series', glyph: '❐' },
    ];
    var $ = function (id) {
        return document.getElementById(id);
    };
    var state = { section: 'sources', zone: 'categories', source: null, adapter: null, info: null, episodesOf: null, token: 0, timer: null, cache: {}, armed: null };

    var categories = List($('categories'), {
        rows: 14,
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
        rows: 14,
        title: function () {
            if (state.section === 'sources') return 'Source';
            if (state.episodesOf) return state.episodesOf.name;
            var category = categories.item();
            return category ? category.category_name : '';
        },
        label: function (it) {
            if (it.label) return it.label;
            return (it.num && state.section === 'live' ? it.num + '. ' : '') + it.name;
        },
        icon: function (it) {
            return it.stream_icon || it.cover || it.logo || null;
        },
    });

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
            el.innerHTML = '<span class="glyph"></span><span></span>';
            el.firstChild.textContent = section.glyph;
            el.lastChild.textContent = section.label;
            $('rail').appendChild(el);
        });
        $('source-name').textContent = state.source ? state.source.name : 'No source yet';
        $('source-type').textContent = state.source ? Sources.typeLabel(state.source) : 'Add one in Sources';
        var category = categories.item();
        $('breadcrumb').textContent =
            sectionOf(state.section).label + (state.section !== 'sources' && category ? ' / ' + category.category_name : '');
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
        var token = ++state.token;
        items.set([], 0, '');
        if (id === 'sources') return showSources(0);
        categories.set([], 0, 'Loading…');
        renderChrome();
        cached(id + ':categories', function () {
            return state.adapter.categories(id);
        })
            .then(function (list) {
                if (token !== state.token) return;
                categories.set(list, 0, 'No categories');
                loadItems();
            })
            .catch(fail(categories, 'CATEGORIES'));
    }

    function loadItems() {
        var category = categories.item();
        if (!category || state.section === 'sources') return;
        var section = state.section;
        var token = ++state.token;
        state.episodesOf = null;
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
        items.set([], 0, 'Loading episodes…');
        cached('episodes:' + show.series_id, function () {
            return state.adapter.episodes(show);
        })
            .then(function (episodes) {
                if (token === state.token) items.set(episodes, 0, 'No episodes');
            })
            .catch(fail(items, 'EPISODES'));
    }

    function closeEpisodes() {
        var previous = state.episodesOf;
        state.episodesOf = null;
        state.token++;
        items.set(previous.list, previous.index);
    }

    function activateItem() {
        var item = items.item();
        if (!item) return;
        if (state.section === 'sources') return sourceAction();
        if (state.section === 'live') return hooks.play(state.adapter.liveRequest(item));
        if (state.section === 'movies') return hooks.play(state.adapter.movieRequest(item));
        if (state.episodesOf) return hooks.play(state.adapter.episodeRequest(state.episodesOf.show, item));
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

    function onKey(code) {
        if (state.zone === 'rail') {
            if (code === KEY.UP || code === KEY.DOWN) moveSection(code === KEY.UP ? -1 : 1);
            else if (code === KEY.RIGHT || code === KEY.ENTER) setZone('categories');
            else if (isBack(code)) hooks.exit();
            else return false;
        } else if (state.zone === 'categories') {
            var row = categories.item();
            if (STEPS[code]) {
                if (categories.move(STEPS[code])) onCategoryMoved();
            } else if (code === KEY.LEFT || isBack(code)) setZone('rail');
            else if (code === KEY.ENTER && row && row.action) addSource(row.action);
            else if ((code === KEY.RIGHT || code === KEY.ENTER) && items.items().length) setZone('items');
            else return code === KEY.RIGHT || code === KEY.ENTER;
        } else {
            if (STEPS[code]) items.move(STEPS[code]);
            else if (code === KEY.ENTER) activateItem();
            else if (code === KEY.LEFT || isBack(code)) {
                if (state.episodesOf) closeEpisodes();
                else setZone('categories');
            } else return false;
        }
        return true;
    }

    // Next/previous live channel while watching; null at the ends of the list.
    function zap(delta) {
        if (state.section !== 'live' || !items.move(delta)) return null;
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
