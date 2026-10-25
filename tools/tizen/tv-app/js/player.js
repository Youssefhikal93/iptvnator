// Full-screen playback. A request lists the players to try in order
// (`sources: [{ via, url }]`): live TV uses mpegts.js (as IPTVnator's web
// player does), then hls.js, then Samsung AVPlay; movies and episodes
// (mp4/mkv) use AVPlay, then the <video> element. Only one stream is open at
// a time: single-connection accounts answer 503 while another stream is open.
window.Player = (function () {
    'use strict';

    var ATTEMPT_TIMEOUT_MS = 20000;
    var BUSY_RETRY_MS = 2000;
    var SEEK_FORWARD_MS = 30000;
    var SEEK_BACK_MS = 10000;

    var playerEl = document.getElementById('player');
    var video = document.getElementById('video');
    var osd = document.getElementById('osd');
    var lib = null;
    var usingAv = false;
    var session = 0;
    var osdTimer = null;
    var current = null;

    function avplay() {
        return window.webapis && window.webapis.avplay;
    }

    function wait(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function showOsd(text, sticky) {
        osd.textContent = text;
        osd.classList.remove('hidden');
        clearTimeout(osdTimer);
        if (!sticky) {
            osdTimer = setTimeout(function () {
                osd.classList.add('hidden');
            }, 4000);
        }
    }

    function heading(req) {
        return req.title + (req.subtitle ? '\n' + req.subtitle : '');
    }

    // Closes whatever is playing; keeps the player screen.
    function release() {
        if (lib) {
            try {
                lib.destroy();
            } catch (e) {
                // Already torn down.
            }
            lib = null;
        }
        video.onplaying = video.onerror = null;
        video.pause();
        video.removeAttribute('src');
        video.load();
        if (usingAv && avplay()) {
            try {
                avplay().stop();
            } catch (e) {
                // Not playing.
            }
            try {
                avplay().close();
            } catch (e) {
                // Not open.
            }
        }
        usingAv = false;
    }

    // Runs one playback attempt; resolves null when playing, else a reason.
    function attempt(start) {
        return new Promise(function (resolve) {
            var done = false;
            function finish(error) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve(error);
            }
            var timer = setTimeout(function () {
                finish('timeout');
            }, ATTEMPT_TIMEOUT_MS);
            try {
                start(finish);
            } catch (e) {
                finish(e.name || String(e));
            }
        });
    }

    function viaMpegts(url) {
        return function (finish) {
            if (!window.mpegts || !mpegts.isSupported()) return finish('mpegts.js unsupported');
            lib = mpegts.createPlayer({ type: 'mpegts', isLive: true, url: url }, { enableStashBuffer: false });
            lib.on(mpegts.Events.ERROR, function (type, detail, info) {
                finish(type + ' ' + detail + ' ' + ((info && info.code) || ''));
            });
            video.onplaying = function () {
                finish(null);
            };
            lib.attachMediaElement(video);
            lib.load();
            var played = lib.play();
            if (played && played.catch) played.catch(function () {});
        };
    }

    function viaHls(url) {
        return function (finish) {
            if (!window.Hls || !Hls.isSupported()) return finish('hls.js unsupported');
            lib = new Hls();
            lib.on(Hls.Events.ERROR, function (event, data) {
                if (!data.fatal) return;
                var status = data.response && data.response.code;
                finish(data.details + (status ? ' HTTP ' + status : ''));
            });
            video.onplaying = function () {
                finish(null);
            };
            lib.loadSource(url);
            lib.attachMedia(video);
            video.play().catch(function () {});
        };
    }

    function viaAvPlay(url) {
        return function (finish) {
            var av = avplay();
            if (!av) return finish('AVPlay unavailable');
            usingAv = true;
            av.open(url);
            av.setListener({
                onerror: function (type) {
                    finish(String(type));
                },
                onstreamcompleted: function () {
                    showOsd('Finished');
                },
            });
            av.setDisplayRect(0, 0, 1920, 1080);
            av.prepareAsync(
                function () {
                    av.play();
                    finish(null);
                },
                function (err) {
                    finish('prepare ' + (err && err.name));
                }
            );
        };
    }

    function viaVideo(url) {
        return function (finish) {
            video.onplaying = function () {
                finish(null);
            };
            video.onerror = function () {
                finish('media error ' + (video.error ? video.error.code : '?'));
            };
            video.src = url;
            video.play().catch(function () {});
        };
    }

    function play(req) {
        release();
        var mine = ++session;
        current = req;
        playerEl.classList.remove('hidden', 'av');
        showOsd(heading(req) + '\nLoading…', true);

        var STARTERS = { mpegts: viaMpegts, hls: viaHls, avplay: viaAvPlay, video: viaVideo };
        var attempts = req.sources.map(function (source) {
            return [source.via, STARTERS[source.via](source.url)];
        });

        function next(index, retried) {
            if (mine !== session) return Promise.resolve();
            if (index >= attempts.length) {
                showOsd(heading(req) + '\nCould not play this. It may be offline.', true);
                return Promise.resolve();
            }
            var name = attempts[index][0];
            return attempt(attempts[index][1]).then(function (error) {
                if (mine !== session) return;
                if (!error) {
                    Log.info('PLAY OK ' + name + ' ' + req.title);
                    playerEl.classList.toggle('av', usingAv);
                    showOsd(heading(req));
                    return;
                }
                Log.error('PLAY FAIL ' + name + ' ' + req.title + ' (' + error + ')');
                release();
                // 503 means the previous stream is still counted (retry once
                // after a pause) or the channel is offline (other players
                // would get the same answer, so stop).
                if (/503/.test(error)) {
                    if (retried) {
                        showOsd(heading(req) + '\nThis channel is offline or your connection is busy.', true);
                        return;
                    }
                    return wait(BUSY_RETRY_MS).then(function () {
                        return next(index, true);
                    });
                }
                return next(index + 1, false);
            });
        }
        return next(0, false);
    }

    function stop() {
        session++;
        current = null;
        release();
        clearTimeout(osdTimer);
        osd.classList.add('hidden');
        playerEl.classList.add('hidden');
    }

    function togglePause() {
        if (usingAv) {
            var av = avplay();
            if (av.getState() === 'PLAYING') {
                av.pause();
                showOsd('Paused', true);
            } else {
                av.play();
                showOsd('Playing');
            }
        } else if (video.paused) {
            video.play().catch(function () {});
            showOsd('Playing');
        } else {
            video.pause();
            showOsd('Paused', true);
        }
    }

    function seek(forward) {
        var ms = forward ? SEEK_FORWARD_MS : SEEK_BACK_MS;
        if (usingAv) {
            try {
                if (forward) avplay().jumpForward(ms);
                else avplay().jumpBackward(ms);
            } catch (e) {
                // Not seekable.
            }
        } else {
            video.currentTime = Math.max(0, video.currentTime + (forward ? ms : -ms) / 1000);
        }
        showOsd((forward ? '+' : '−') + ms / 1000 + ' s');
    }

    return {
        play: play,
        stop: stop,
        togglePause: togglePause,
        seek: seek,
        info: function () {
            if (current) showOsd(heading(current));
        },
        isOpen: function () {
            return current !== null;
        },
    };
})();
