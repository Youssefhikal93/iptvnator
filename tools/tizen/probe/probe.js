// Checks, on a real Samsung TV, whether a packaged Tizen web app can reach
// IPTV providers directly (no CORS proxy) and play their streams.
// Kept ES2015-level: 2017-2018 TVs ship an old Chromium.
(function () {
    'use strict';

    var PLAY_TIMEOUT_MS = 15000;
    // One channel per run: Xtream panels' flood protection blocks the IP after
    // a burst of failed stream requests.
    var MAX_CHANNELS = 1;
    var running = false;
    var VLC_USER_AGENT = 'VLC/3.0.20 LibVLC/3.0.20';
    var RETRY_PAUSE_MS = 5000;
    // Optional log receiver on the developer PC (see INSTALLATION-TO-TV.md).
    var REMOTE_LOG_URL = 'http://192.168.0.21:8765/log';
    var FIELDS = ['xtream-url', 'xtream-user', 'xtream-pass', 'xtream-channel', 'm3u-url'];
    var logEl = document.getElementById('log');
    var video = document.getElementById('video');
    var secrets = [];

    function $(id) {
        return document.getElementById(id);
    }

    function redact(text) {
        return secrets.reduce(function (out, secret) {
            return secret ? out.split(secret).join('***') : out;
        }, String(text));
    }

    function log(message, cls) {
        var line = document.createElement('div');
        line.textContent = redact(message);
        if (REMOTE_LOG_URL) {
            // Mirrors every (redacted) line to the developer PC; best effort.
            fetch(REMOTE_LOG_URL, { method: 'POST', body: line.textContent }).catch(
                function () {}
            );
        }
        if (cls) line.className = cls;
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
    }

    function stored(key, value) {
        try {
            if (value === undefined) return localStorage.getItem(key) || '';
            localStorage.setItem(key, value);
        } catch (e) {
            return '';
        }
    }

    function fetchText(url) {
        return fetch(url).then(function (res) {
            return res.text().then(function (body) {
                return { status: res.status, body: body };
            });
        });
    }

    function fetchJson(url) {
        return fetchText(url).then(function (res) {
            return { status: res.status, json: JSON.parse(res.body) };
        });
    }

    function avplay() {
        return window.webapis && window.webapis.avplay;
    }

    function stopVideo() {
        destroyLibPlayer();
        video.pause();
        video.removeAttribute('src');
        video.load();
        if (avplay()) {
            try {
                avplay().stop();
                avplay().close();
            } catch (e) {
                // Already closed.
            }
        }
    }

    var libPlayer = null;

    function destroyLibPlayer() {
        if (!libPlayer) return;
        try {
            libPlayer.destroy();
        } catch (e) {
            // Already torn down.
        }
        libPlayer = null;
    }

    // Plays through the libraries IPTVnator's web player uses (MSE-based),
    // which handle streams the TV's native <video> source rejects.
    function tryLibrary(label, url) {
        var isTs = /\.ts(\?|$)/.test(url);
        return new Promise(function (resolve) {
            var done = false;
            function finish(ok, detail) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                video.onplaying = null;
                log((ok ? 'LIB OK  ' : 'LIB FAIL ') + label + ' ' + detail, ok ? 'ok' : 'fail');
                resolve(ok);
            }
            var timer = setTimeout(function () {
                finish(false, '(timeout)');
            }, PLAY_TIMEOUT_MS);
            log('Trying ' + label + ': ' + url);
            stopVideo();
            video.onplaying = function () {
                finish(true, '');
            };
            try {
                if (isTs) {
                    if (!window.mpegts || !mpegts.isSupported()) {
                        finish(false, '(mpegts.js not supported)');
                        return;
                    }
                    libPlayer = mpegts.createPlayer({ type: 'mpegts', isLive: true, url: url });
                    libPlayer.on(mpegts.Events.ERROR, function (type, detail, info) {
                        finish(false, '(' + type + ' ' + detail + ' ' + ((info && info.code) || '') + ')');
                    });
                    libPlayer.attachMediaElement(video);
                    libPlayer.load();
                    libPlayer.play();
                } else {
                    if (!window.Hls || !Hls.isSupported()) {
                        finish(false, '(hls.js not supported)');
                        return;
                    }
                    libPlayer = new Hls();
                    libPlayer.on(Hls.Events.ERROR, function (event, data) {
                        if (!data.fatal) return;
                        var status = data.response && data.response.code;
                        finish(false, '(' + data.details + (status ? ' HTTP ' + status : '') + ')');
                    });
                    libPlayer.loadSource(url);
                    libPlayer.attachMedia(video);
                    video.play();
                }
            } catch (e) {
                finish(false, '(' + (e.name || e) + ')');
            }
        });
    }

    function pause() {
        stopVideo();
        return new Promise(function (resolve) {
            setTimeout(resolve, RETRY_PAUSE_MS);
        });
    }

    // Requests the stream like a browser would and reports the HTTP status and
    // the address after redirects, without downloading the stream.
    function checkStream(url) {
        return fetch(url)
            .then(function (res) {
                log(
                    'STREAM HTTP ' + res.status + ' ' + res.statusText +
                        (res.redirected ? ' redirected to ' + res.url : ''),
                    res.ok ? 'ok' : 'fail'
                );
                var headers = [];
                res.headers.forEach(function (value, name) {
                    headers.push(name + ': ' + value);
                });
                log('STREAM headers: ' + headers.join(' | '));
                if (!res.body) return;
                // First chunk only: an error page is small, a live stream endless.
                var reader = res.body.getReader();
                return reader.read().then(function (chunk) {
                    reader.cancel();
                    if (!res.ok && chunk.value) {
                        var text = new TextDecoder().decode(chunk.value.slice(0, 400));
                        log('STREAM body: ' + text.replace(/\s+/g, ' '));
                    }
                });
            })
            .catch(function (err) {
                log('STREAM FETCH FAIL ' + err, 'fail');
            });
    }

    // Samsung's native player; it plays MPEG-TS and HLS that <video> rejects.
    function tryAvPlay(label, url, userAgent) {
        return new Promise(function (resolve) {
            if (!avplay()) {
                log('AVPLAY N/A  webapis not available', 'fail');
                resolve(false);
                return;
            }
            var done = false;
            function finish(ok, detail) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                log(
                    (ok ? 'AVPLAY OK  ' : 'AVPLAY FAIL ') + label + ' ' + detail,
                    ok ? 'ok' : 'fail'
                );
                resolve(ok);
            }
            var timer = setTimeout(function () {
                finish(false, '(timeout)');
            }, PLAY_TIMEOUT_MS);
            log('Trying AVPlay ' + label + ': ' + url);
            var step = 'close';
            try {
                if (avplay().getState() !== 'NONE') avplay().close();
                step = 'open';
                avplay().open(url);
                if (userAgent) {
                    step = 'setStreamingProperty';
                    avplay().setStreamingProperty('USER_AGENT', userAgent);
                }
                step = 'setListener';
                avplay().setListener({
                    onerror: function (type) {
                        finish(false, '(onerror ' + type + ')');
                    },
                });
                step = 'setDisplayRect';
                avplay().setDisplayRect(1216, 672, 640, 360);
                step = 'prepareAsync';
                avplay().prepareAsync(
                    function () {
                        try {
                            avplay().play();
                            finish(true, '');
                        } catch (e) {
                            finish(false, '(play ' + (e.name || e) + ')');
                        }
                    },
                    function (err) {
                        finish(false, '(prepare ' + (err && err.name) + ')');
                    }
                );
            } catch (e) {
                finish(
                    false,
                    '(' + step + ' ' + (e.name || e) + ': ' + (e.message || '') + ')'
                );
            }
        });
    }

    function tryPlay(label, url) {
        return new Promise(function (resolve) {
            var done = false;
            function finish(ok, detail) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                video.onplaying = video.onerror = null;
                log(
                    (ok ? 'PLAY OK  ' : 'PLAY FAIL ') + label + ' ' + detail,
                    ok ? 'ok' : 'fail'
                );
                resolve(ok);
            }
            var timer = setTimeout(function () {
                finish(false, '(timeout)');
            }, PLAY_TIMEOUT_MS);
            video.onplaying = function () {
                finish(true, '');
            };
            video.onerror = function () {
                var err = video.error;
                finish(false, '(media error ' + (err ? err.code : '?') + ')');
            };
            log('Trying ' + label + ': ' + url);
            video.src = url;
            video.play();
        });
    }

    // Tries AVPlay TS, then AVPlay HLS, on each channel until one plays.
    function tryChannels(base, user, pass, channels, index) {
        if (index >= channels.length) {
            log('No tested channel played', 'fail');
            return Promise.resolve();
        }
        var channel = channels[index];
        var prefix = base + '/live/' + user + '/' + pass + '/' + channel.stream_id;
        log('Channel ' + (index + 1) + ': ' + channel.name);
        // One open stream at a time, with a pause so a one-connection account
        // has released the previous try before the next one starts.
        // A plain request first, on a fresh connection, to capture the server's
        // own answer; then the real app's libraries; then Samsung's player.
        return checkStream(prefix + '.ts')
            .then(pause)
            .then(function () {
                return tryLibrary('mpegts.js live TS', prefix + '.ts');
            })
            .then(function (ok) {
                return ok || pause().then(function () {
                    return tryLibrary('hls.js live HLS', prefix + '.m3u8');
                });
            })
            .then(function (ok) {
                return ok || pause().then(function () {
                    return tryAvPlay('live TS', prefix + '.ts');
                });
            })
            .then(function (ok) {
                return ok || pause().then(function () {
                    return tryAvPlay('live TS as VLC', prefix + '.ts', VLC_USER_AGENT);
                });
            })
            .then(function (ok) {
                return ok || pause().then(function () {
                    return tryAvPlay('live HLS', prefix + '.m3u8');
                });
            })
            .then(function (ok) {
                return ok || pause();
            })
            .then(function (ok) {
                return ok || tryChannels(base, user, pass, channels, index + 1);
            });
    }

    function testXtream() {
        if (running) {
            log('A test is already running');
            return;
        }
        running = true;
        return runXtreamTest().then(function () {
            running = false;
        });
    }

    function runXtreamTest() {
        var base = $('xtream-url').value.trim().replace(/\/+$/, '');
        var user = $('xtream-user').value.trim();
        var pass = $('xtream-pass').value.trim();
        // Same as IPTVnator's XtreamUrlService: credentials are URL-encoded
        // in stream paths.
        var userPath = encodeURIComponent(user);
        var passPath = encodeURIComponent(pass);
        secrets = [user, pass, userPath, passPath];
        var api =
            base +
            '/player_api.php?username=' +
            encodeURIComponent(user) +
            '&password=' +
            encodeURIComponent(pass);
        log('--- Xtream test ---');
        return fetchJson(api)
            .then(function (res) {
                var info = (res.json && res.json.user_info) || {};
                log(
                    'API OK  HTTP ' + res.status + ', auth=' + info.auth +
                        ', status=' + info.status +
                        ', connections ' + info.active_cons + '/' + info.max_connections,
                    'ok'
                );
                var safeInfo = {};
                Object.keys(info).forEach(function (key) {
                    if (key !== 'username' && key !== 'password') safeInfo[key] = info[key];
                });
                log('user_info: ' + JSON.stringify(safeInfo));
                log('server_info: ' + JSON.stringify((res.json && res.json.server_info) || {}));
                return fetchJson(api + '&action=get_live_streams');
            })
            .then(function (res) {
                var streams = Array.isArray(res.json) ? res.json : [];
                log('Live channels: ' + streams.length, 'ok');
                // Lists often start with dead divider entries such as "#### UK ####".
                // An optional channel name (or stream id) picks one known to
                // play elsewhere; otherwise the first real channels are tried.
                var wanted = $('xtream-channel').value.trim().toLowerCase();
                // Every word of the wanted name must appear in the channel name,
                // ignoring case, spaces and punctuation ("bein sport hd 1"
                // matches "beIN SPORTS HD 1").
                var words = wanted.split(/\s+/).filter(Boolean);
                var squash = function (text) {
                    return text.toLowerCase().replace(/[^a-z0-9]/g, '');
                };
                var candidates = streams
                    .filter(function (s) {
                        if (!s.name) return false;
                        if (wanted) {
                            var name = squash(s.name);
                            return String(s.stream_id) === wanted ||
                                words.every(function (w) {
                                    return name.indexOf(squash(w)) !== -1;
                                });
                        }
                        return !/[#*=]{3,}|^\s*-{2,}/.test(s.name);
                    });
                if (wanted) {
                    log(
                        'Matches for "' + wanted + '": ' + candidates.length + ' ' +
                            candidates.slice(0, 5).map(function (s) {
                                return s.name + ' #' + s.stream_id;
                            }).join(', ')
                    );
                }
                candidates = candidates.slice(0, MAX_CHANNELS);
                if (!candidates.length) log('No channel matches "' + wanted + '"', 'fail');
                log(
                    'Login needs URL encoding: ' +
                        (userPath !== user || passPath !== pass ? 'YES' : 'no')
                );
                return tryChannels(base, userPath, passPath, candidates, 0);
            })
            .catch(function (err) {
                log(
                    'API FAIL ' + err + ' (TypeError usually means CORS or network block)',
                    'fail'
                );
            });
    }

    function testM3u() {
        var url = $('m3u-url').value.trim();
        secrets = [];
        log('--- M3U test ---');
        return fetchText(url)
            .then(function (res) {
                var lines = res.body.split(/\r?\n/);
                var entries = lines.filter(function (l) {
                    return l.indexOf('#EXTINF') === 0;
                }).length;
                log('Download OK  HTTP ' + res.status + ', entries=' + entries, 'ok');
                var first = lines.filter(function (l) {
                    return l.trim() && l.charAt(0) !== '#';
                })[0];
                if (!first) return;
                return tryAvPlay('first entry', first.trim()).then(function () {
                    return tryPlay('first entry', first.trim());
                });
            })
            .catch(function (err) {
                log(
                    'Download FAIL ' + err + ' (TypeError usually means CORS or network block)',
                    'fail'
                );
            });
    }

    function focusables() {
        return Array.prototype.slice.call(
            document.querySelectorAll('input, button')
        );
    }

    function moveFocus(step) {
        var items = focusables();
        var index = items.indexOf(document.activeElement);
        var next = (index + step + items.length) % items.length;
        items[next].focus();
    }

    document.addEventListener('keydown', function (event) {
        switch (event.keyCode) {
            case 38: // up
            case 37: // left
                moveFocus(-1);
                event.preventDefault();
                break;
            case 40: // down
            case 39: // right
                moveFocus(1);
                event.preventDefault();
                break;
            case 10009: // Return
                var avState = avplay() ? avplay().getState() : 'NONE';
                if (video.getAttribute('src') || avState !== 'NONE') {
                    stopVideo();
                } else if (window.tizen) {
                    tizen.application.getCurrentApplication().exit();
                }
                break;
        }
    });

    FIELDS.forEach(function (id) {
        $(id).value = stored('probe:' + id);
        $(id).addEventListener('change', function () {
            stored('probe:' + id, $(id).value);
        });
    });
    $('test-xtream').addEventListener('click', testXtream);
    $('test-m3u').addEventListener('click', testM3u);
    $('stop').addEventListener('click', stopVideo);
    focusables()[0].focus();
    log('Ready. Use arrows to move, OK to type or press, Return to stop/exit.');
    log('User agent: ' + navigator.userAgent);
    // A channel known to play on the laptop; one run on launch, so a remote
    // `tizen run` produces the log without anyone pressing buttons.
    if (!$('xtream-channel').value) $('xtream-channel').value = 'bein sport hd 1';
    if ($('xtream-url').value && $('xtream-user').value && $('xtream-pass').value) {
        setTimeout(testXtream, 2000);
    }
})();
