// Screens (login, browser, player) and remote-control navigation.
(function () {
    'use strict';

    var KEY = {
        LEFT: 37,
        UP: 38,
        RIGHT: 39,
        DOWN: 40,
        ENTER: 13,
        RETURN: 10009,
        BACKSPACE: 8,
        ESCAPE: 27,
        CH_UP: 427,
        CH_DOWN: 428,
        PLAY_PAUSE: 10252,
        PLAY: 415,
        PAUSE: 19,
        STOP: 413,
        FAST_FORWARD: 417,
        REWIND: 412,
    };
    var MEDIA_KEYS = ['ChannelUp', 'ChannelDown', 'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind'];
    var STORE_KEY = 'iptvnator-tv:credentials';
    var PAGE = 10;
    var TABS = [
        { id: 'live', label: 'Live TV' },
        { id: 'movies', label: 'Movies' },
        { id: 'series', label: 'Series' },
        { id: 'account', label: 'Account' },
    ];
    var LOGIN_FIELDS = ['login-url', 'login-user', 'login-pass', 'login-save'];

    var $ = function (id) {
        return document.getElementById(id);
    };
    var state = {
        screen: 'login',
        tab: 0,
        zone: 'categories',
        account: null,
        episodesOf: null,
        loadToken: 0,
        itemsTimer: null,
        cache: {},
    };

    var categories = List($('categories'), {
        rows: 13,
        title: function () {
            return TABS[state.tab].id === 'account' ? 'Account' : 'Categories';
        },
        label: function (c) {
            return c.category_name;
        },
    });
    var items = List($('items'), {
        rows: 13,
        title: function () {
            return state.episodesOf ? state.episodesOf.name : TABS[state.tab].label;
        },
        label: function (it) {
            if (it.label) return it.label;
            return (it.num && TABS[state.tab].id === 'live' ? it.num + '. ' : '') + it.name;
        },
        icon: function (it) {
            return it.stream_icon || it.cover || null;
        },
    });

    function tabId() {
        return TABS[state.tab].id;
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

    function showScreen(name) {
        state.screen = name;
        $('login').classList.toggle('hidden', name !== 'login');
        $('browser').classList.toggle('hidden', name !== 'browser');
    }

    // ---- Login ----

    function readSaved() {
        try {
            return JSON.parse(localStorage.getItem(STORE_KEY));
        } catch (e) {
            return null;
        }
    }

    function showLogin(message) {
        var saved = readSaved() || {};
        $('login-url').value = saved.url || '';
        $('login-user').value = saved.user || '';
        $('login-pass').value = saved.pass || '';
        $('login-msg').textContent = message || '';
        showScreen('login');
        $('login-url').focus();
    }

    function submitLogin() {
        var creds = {
            url: $('login-url').value,
            user: $('login-user').value,
            pass: $('login-pass').value,
        };
        if (!creds.url.trim() || !creds.user.trim() || !creds.pass.trim()) {
            $('login-msg').textContent = 'Fill in all three fields.';
            return;
        }
        Api.setCredentials(creds);
        $('login-msg').textContent = 'Signing in…';
        Api.account()
            .then(function (account) {
                if (!account.user_info || String(account.user_info.auth) !== '1') {
                    throw new Error('the server rejected this login');
                }
                try {
                    localStorage.setItem(STORE_KEY, JSON.stringify(creds));
                } catch (e) {
                    // Signed in for this session only.
                }
                state.account = account.user_info;
                openBrowser();
            })
            .catch(function (err) {
                Log.error('LOGIN FAIL ' + err.message);
                $('login-msg').textContent = 'Could not sign in: ' + err.message;
            });
    }

    function onLoginKey(event) {
        var code = event.keyCode;
        var index = LOGIN_FIELDS.indexOf(document.activeElement && document.activeElement.id);
        if (code === KEY.UP || code === KEY.DOWN) {
            var next = Math.max(0, Math.min(LOGIN_FIELDS.length - 1, index + (code === KEY.UP ? -1 : 1)));
            $(LOGIN_FIELDS[next]).focus();
            event.preventDefault();
        } else if (code === KEY.ENTER && LOGIN_FIELDS[index] === 'login-save') {
            submitLogin();
            event.preventDefault();
        } else if (code === KEY.RETURN) {
            exitApp();
        }
    }

    // ---- Browser ----

    function openBrowser() {
        showScreen('browser');
        state.cache = {};
        openTab(0);
        setZone('categories');
    }

    function renderTabs() {
        $('tabs').innerHTML = '';
        TABS.forEach(function (tab, i) {
            var el = document.createElement('div');
            el.className = 'tab' + (i === state.tab ? ' active' : '') + (i === state.tab && state.zone === 'tabs' ? ' focused' : '');
            el.textContent = tab.label;
            $('tabs').appendChild(el);
        });
    }

    function setZone(zone) {
        state.zone = zone;
        renderTabs();
        categories.setActive(zone === 'categories');
        items.setActive(zone === 'items');
    }

    function accountRows() {
        var u = state.account || {};
        var expires = u.exp_date ? new Date(Number(u.exp_date) * 1000).toLocaleDateString() : 'unknown';
        return [
            { category_name: 'Status: ' + (u.status || 'unknown') },
            { category_name: 'Expires: ' + expires },
            { category_name: 'Connections: ' + (u.active_cons || 0) + ' / ' + (u.max_connections || '?') },
            { category_name: 'Server: ' + Api.serverUrl() },
            { category_name: 'Sign out', action: 'logout' },
        ];
    }

    function openTab(index) {
        var tab = TABS[index].id;
        state.tab = index;
        state.episodesOf = null;
        state.loadToken++;
        renderTabs();
        items.set([], 0, '');
        if (tab === 'account') {
            categories.set(accountRows(), 0);
            return;
        }
        categories.set([], 0, 'Loading…');
        var token = state.loadToken;
        cached(tab + ':categories', function () {
            return Api.categories(tab);
        })
            .then(function (list) {
                if (token !== state.loadToken) return;
                list = Array.isArray(list) ? list : [];
                if (tab === 'live') list = [{ category_id: '', category_name: 'All channels' }].concat(list);
                categories.set(list, 0, 'No categories');
                loadItems();
            })
            .catch(function (err) {
                Log.error('CATEGORIES FAIL ' + tab + ' ' + err.message);
                if (token === state.loadToken) categories.set([], 0, 'Could not load: ' + err.message);
            });
    }

    function loadItemsSoon() {
        clearTimeout(state.itemsTimer);
        state.itemsTimer = setTimeout(loadItems, 350);
    }

    function loadItems() {
        var tab = tabId();
        var category = categories.item();
        if (!category || tab === 'account') return;
        var token = ++state.loadToken;
        state.episodesOf = null;
        items.set([], 0, 'Loading…');
        cached(tab + ':items:' + category.category_id, function () {
            return Api.items(tab, category.category_id);
        })
            .then(function (list) {
                if (token === state.loadToken) items.set(Array.isArray(list) ? list : [], 0, 'Empty category');
            })
            .catch(function (err) {
                Log.error('ITEMS FAIL ' + tab + ' ' + err.message);
                if (token === state.loadToken) items.set([], 0, 'Could not load: ' + err.message);
            });
    }

    function openEpisodes(show) {
        var token = ++state.loadToken;
        state.episodesOf = { name: show.name, list: items.items(), index: items.index() };
        items.set([], 0, 'Loading episodes…');
        cached('series-info:' + show.series_id, function () {
            return Api.seriesInfo(show.series_id);
        })
            .then(function (info) {
                if (token !== state.loadToken) return;
                var seasons = (info && info.episodes) || {};
                var episodes = [];
                Object.keys(seasons)
                    .sort(function (a, b) {
                        return Number(a) - Number(b);
                    })
                    .forEach(function (season) {
                        (seasons[season] || []).forEach(function (ep) {
                            episodes.push({
                                id: ep.id,
                                container_extension: ep.container_extension,
                                label: 'S' + (ep.season || season) + ' E' + (ep.episode_num || '?') + '  ' + (ep.title || ''),
                            });
                        });
                    });
                items.set(episodes, 0, 'No episodes');
            })
            .catch(function (err) {
                Log.error('EPISODES FAIL ' + err.message);
                if (token === state.loadToken) items.set([], 0, 'Could not load: ' + err.message);
            });
    }

    function closeEpisodes() {
        var previous = state.episodesOf;
        state.episodesOf = null;
        state.loadToken++;
        items.set(previous.list, previous.index);
    }

    function playLive(index) {
        items.select(index);
        var channel = items.item();
        state.screen = 'player';
        Player.play({
            live: true,
            title: (channel.num ? channel.num + '. ' : '') + channel.name,
            tsUrl: Api.liveUrl(channel.stream_id, 'ts'),
            hlsUrl: Api.liveUrl(channel.stream_id, 'm3u8'),
        });
    }

    function openItem() {
        var item = items.item();
        if (!item) return;
        var tab = tabId();
        if (tab === 'live') {
            playLive(items.index());
        } else if (tab === 'movies') {
            state.screen = 'player';
            Player.play({ live: false, title: item.name, url: Api.movieUrl(item.stream_id, item.container_extension) });
        } else if (state.episodesOf) {
            state.screen = 'player';
            Player.play({
                live: false,
                title: state.episodesOf.name,
                subtitle: item.label,
                url: Api.episodeUrl(item.id, item.container_extension),
            });
        } else {
            openEpisodes(item);
        }
    }

    function signOut() {
        try {
            localStorage.removeItem(STORE_KEY);
        } catch (e) {
            // Nothing stored.
        }
        state.account = null;
        state.cache = {};
        showLogin('Signed out.');
    }

    function onBrowserKey(code) {
        if (state.zone === 'tabs') {
            if (code === KEY.LEFT && state.tab > 0) openTab(state.tab - 1);
            else if (code === KEY.RIGHT && state.tab < TABS.length - 1) openTab(state.tab + 1);
            else if (code === KEY.DOWN || code === KEY.ENTER) setZone('categories');
            else if (isBack(code)) exitApp();
            else return false;
        } else if (state.zone === 'categories') {
            var step = { 38: -1, 40: 1, 427: -PAGE, 428: PAGE }[code];
            if (code === KEY.UP && categories.index() === 0) setZone('tabs');
            else if (step) {
                if (categories.move(step)) loadItemsSoon();
            } else if (code === KEY.RIGHT || code === KEY.ENTER) {
                var row = categories.item();
                if (row && row.action === 'logout') signOut();
                else if (items.items().length) setZone('items');
            } else if (isBack(code)) setZone('tabs');
            else return false;
        } else {
            var move = { 38: -1, 40: 1, 427: -PAGE, 428: PAGE }[code];
            if (move) items.move(move);
            else if (code === KEY.ENTER) openItem();
            else if (code === KEY.LEFT || isBack(code)) {
                if (state.episodesOf) closeEpisodes();
                else setZone('categories');
            } else return false;
        }
        return true;
    }

    // ---- Player ----

    function closePlayer() {
        Player.stop();
        state.screen = 'browser';
    }

    function onPlayerKey(code) {
        var live = tabId() === 'live';
        if (isBack(code) || code === KEY.STOP) closePlayer();
        else if (live && (code === KEY.CH_UP || code === KEY.UP)) zap(1);
        else if (live && (code === KEY.CH_DOWN || code === KEY.DOWN)) zap(-1);
        else if (live && code === KEY.ENTER) Player.info();
        else if (!live && [KEY.ENTER, KEY.PLAY_PAUSE, KEY.PLAY, KEY.PAUSE].indexOf(code) !== -1) Player.togglePause();
        else if (!live && (code === KEY.RIGHT || code === KEY.FAST_FORWARD)) Player.seek(true);
        else if (!live && (code === KEY.LEFT || code === KEY.REWIND)) Player.seek(false);
        else return false;
        return true;
    }

    function zap(delta) {
        var next = items.index() + delta;
        if (next >= 0 && next < items.items().length) playLive(next);
    }

    // ---- Startup ----

    function exitApp() {
        Player.stop();
        try {
            tizen.application.getCurrentApplication().exit();
        } catch (e) {
            // Not on a TV.
        }
    }

    document.addEventListener('keydown', function (event) {
        var handled;
        if (state.screen === 'login') return onLoginKey(event);
        if (state.screen === 'player') handled = onPlayerKey(event.keyCode);
        else handled = onBrowserKey(event.keyCode);
        if (handled) event.preventDefault();
    });

    // Leaving the app (Home, Source) must free the account's connection.
    document.addEventListener('visibilitychange', function () {
        if (document.hidden && state.screen === 'player') closePlayer();
    });

    $('login-save').addEventListener('click', submitLogin);

    try {
        tizen.tvinputdevice.registerKeyBatch(MEDIA_KEYS);
    } catch (e) {
        // Not on a TV.
    }

    var saved = readSaved();
    if (saved) {
        Api.setCredentials(saved);
        openBrowser();
        Api.account()
            .then(function (account) {
                state.account = account.user_info || null;
                if (tabId() === 'account') categories.set(accountRows(), categories.index());
            })
            .catch(function (err) {
                Log.error('ACCOUNT FAIL ' + err.message);
            });
    } else {
        showLogin();
    }
    Log.info('IPTVnator TV started');
})();
