// Independent HTML media engines; AVPlay's singleton is never used by tiles.
window.MultiViewEngine = function (video, request, changed) {
    'use strict';

    var chain = PlaybackChain();
    var lib = null;
    var kind = '';
    var disposed = false;
    var ready = false;
    var attempt = 0;
    var pending = null;

    function release() {
        attempt++;
        video.onplaying = video.onerror = video.onended = null;
        if (lib) lib.destroy();
        lib = null;
        video.pause();
        video.removeAttribute('src');
        video.load();
    }

    function refused() {
        if (disposed) return;
        ready = false;
        release();
        Log.error('MULTI-VIEW refused ' + request.title);
        changed('refused');
    }

    function open(source, finish) {
        if (disposed) return;
        var mine = ++attempt;
        pending = finish;
        kind = source.via;
        function failed() {
            if (disposed || mine !== attempt) return;
            if (ready) refused();
            else finish('stream failed');
        }
        video.onerror = failed;
        video.onplaying = function () { if (mine === attempt) finish(null); };
        video.onended = failed;
        if (kind === 'hls') {
            if (!window.Hls || !Hls.isSupported()) return finish('unsupported');
            lib = new Hls({ manifestLoadingMaxRetry: 0, levelLoadingMaxRetry: 0, fragLoadingMaxRetry: 0 });
            lib.on(Hls.Events.ERROR, function (event, details) { if (details.fatal) failed(); });
            lib.loadSource(source.url);
            lib.attachMedia(video);
        } else if (kind === 'mpegts') {
            if (!window.mpegts || !mpegts.isSupported()) return finish('unsupported');
            lib = mpegts.createPlayer({ type: 'mpegts', isLive: true, url: source.url }, { enableStashBuffer: false });
            lib.on(mpegts.Events.ERROR, failed);
            lib.attachMediaElement(video);
            lib.load();
            var playing = lib.play();
            if (playing && playing.catch) playing.catch(function () {});
            return;
        } else video.src = source.url;
        video.play().catch(function () {});
    }

    function tracks() {
        return kind === 'hls' && lib ? PlayerTracks.hls(lib) : PlayerTracks.native(video.audioTracks, video.textTracks);
    }

    function select(type, ref) {
        if (kind === 'hls' && lib) {
            if (type === 'audio') lib.audioTrack = ref;
            else lib.subtitleTrack = ref;
        } else if (type === 'audio') {
            PlayerTracks.nativeList(video.audioTracks).forEach(function (track) { track.enabled = track === ref; });
        } else PlayerTracks.nativeSubtitles(video.textTracks).forEach(function (track) { track.mode = track === ref ? 'showing' : 'disabled'; });
    }

    var attempts = request.sources.filter(function (source) { return source.via !== 'avplay'; }).map(function (source) {
        return { name: source.via, start: function (finish) { open(source, finish); } };
    });
    changed('loading');
    chain.run(attempts, {
        ready: function () {
            ready = true;
            Log.info('MULTI-VIEW playing ' + request.title);
            changed('playing');
        },
        failed: release,
        giveUp: refused,
    });

    return {
        stop: function () {
            disposed = true;
            chain.cancel();
            if (pending) pending('cancelled');
            release();
        },
        tracks: tracks,
        select: select,
    };
};
