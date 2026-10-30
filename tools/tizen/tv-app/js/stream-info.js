// Stream info (#84): a small panel in the corner of the player, updated
// every second, with what plays: resolution, frame rate, video and audio
// codec, bitrate, buffer, the sound route in use, dropped frames where the
// engine reports them, and the engine. Unknown values show "–". The player
// hands over plain engine output (sample()); nothing here reads an engine,
// and the stream's address is never part of what is shown.
//
// sample() -> { engine: 'avplay' | 'hls' | 'mpegts' | 'video',
//   streams: AVPlay getCurrentStreamInfo() entries, avBuffer: AVPlay's last
//   buffering percent, video: { width, height, buffered (s ahead), dropped,
//   frames (decoded so far) }, level: hls.js's playing level, media and
//   stats: mpegts.js mediaInfo and statisticsInfo, route: the AVPlay route
//   ('file', 'm3u8' or 'ts') }.
window.StreamInfo = (() => {
    'use strict';

    const UNKNOWN = '–';
    const TICK_MS = 1000;
    const ENGINES = { avplay: 'Samsung AVPlay', hls: 'hls.js', mpegts: 'mpegts.js', video: 'HTML5 video' };
    const CODECS = [[/^(avc|h\.?264)/i, 'H.264'], [/^(hev|hvc|hevc|h\.?265)/i, 'HEVC'], [/^(vp0?9)/i, 'VP9'], [/^av01/i, 'AV1'],
        [/^(mp4a\.(6b|69)|mp3|mpga)/i, 'MP3'], [/^(mp4a|aac)/i, 'AAC'], [/^(ec-?3|eac3)/i, 'E-AC-3'], [/^(ac-?3)/i, 'AC-3'], [/^opus/i, 'Opus']];

    // The first non-empty field of an AVPlay extra_info object under any of
    // these lower-case names; firmware spells them differently.
    const pick = (obj, names) => {
        for (const name of names) {
            for (const key in obj) {
                if (key.toLowerCase() === name && obj[key] !== '' && obj[key] !== null && obj[key] !== undefined) return obj[key];
            }
        }
        return null;
    };

    const number = (value) => {
        const n = Number(value);
        return isFinite(n) && n > 0 ? n : null;
    };

    const codecName = (codec) => {
        if (!codec) return null;
        const text = String(codec).split(',')[0].trim();
        const known = CODECS.find((entry) => entry[0].test(text));
        return known ? known[1] : text.split('.')[0].toUpperCase();
    };

    const avExtras = (streams, type) => {
        const found = (streams || []).find((info) => info && info.type === type);
        try {
            return found ? JSON.parse(found.extra_info) || {} : null;
        } catch (e) {
            return null;
        }
    };

    // The engine's output as plain values; null where it says nothing.
    const read = (s) => {
        const v = { engine: s.engine, width: null, height: null, fps: null, videoCodec: null, audioCodec: null, channels: null,
            bitrate: null, buffer: null, bufferPercent: null, dropped: null, route: s.route || 'file' };
        if (s.engine === 'avplay') {
            const video = avExtras(s.streams, 'VIDEO') || {};
            const audio = avExtras(s.streams, 'AUDIO') || {};
            v.width = number(pick(video, ['width']));
            v.height = number(pick(video, ['height']));
            v.fps = number(pick(video, ['fps', 'framerate', 'frame_rate']));
            v.videoCodec = codecName(pick(video, ['fourcc', 'codec']));
            v.audioCodec = codecName(pick(audio, ['fourcc', 'codec']));
            v.channels = number(pick(audio, ['channels']));
            const rates = [pick(video, ['bit_rate', 'bitrate']), pick(audio, ['bit_rate', 'bitrate'])].map(number).filter(Boolean);
            v.bitrate = rates.length ? rates.reduce((a, b) => a + b, 0) : null;
            v.bufferPercent = typeof s.avBuffer === 'number' ? Math.max(0, Math.min(100, Math.round(s.avBuffer))) : null;
            return v;
        }
        const video = s.video || {};
        v.width = number(video.width);
        v.height = number(video.height);
        v.buffer = typeof video.buffered === 'number' && video.buffered >= 0 ? video.buffered : null;
        v.dropped = typeof video.dropped === 'number' ? video.dropped : null;
        if (s.engine === 'hls' && s.level) {
            v.fps = number(s.level.frameRate);
            v.videoCodec = codecName(s.level.videoCodec);
            v.audioCodec = codecName(s.level.audioCodec);
            v.bitrate = number(s.level.bitrate);
        }
        if (s.engine === 'mpegts') {
            const media = s.media || {};
            v.fps = number(media.fps);
            v.videoCodec = codecName(media.videoCodec);
            v.audioCodec = codecName(media.audioCodec);
            v.channels = number(media.audioChannelCount);
            const kbps = (number(media.videoDataRate) || 0) + (number(media.audioDataRate) || 0);
            v.bitrate = kbps ? kbps * 1000 : null;
            if (v.dropped === null && s.stats && typeof s.stats.droppedFrames === 'number') v.dropped = s.stats.droppedFrames;
        }
        return v;
    };

    // Frames per second between two readings of decoded frames, when the engine does not say.
    const measuredFps = (before, after) => {
        if (!before || !after || !(after.at > before.at) || !(after.frames >= before.frames)) return null;
        const fps = ((after.frames - before.frames) * 1000) / (after.at - before.at);
        return fps > 0 ? fps : null;
    };

    const bitrate = (bps) => (bps >= 1e6 ? (bps / 1e6).toFixed(1) + ' Mbps' : Math.round(bps / 1000) + ' kbps');
    const fpsText = (fps) => (Math.abs(fps - Math.round(fps)) < 0.01 ? String(Math.round(fps)) : fps.toFixed(2)) + ' fps';
    const known = (value, format) => (value === null || value === undefined ? UNKNOWN : format(value));

    const sound = (route) => (route === 'file' ? I18n.t('player.info.soundOwn')
        : I18n.t('player.info.soundConverted', { route: route === 'm3u8' ? 'HLS' : String(route).toUpperCase() }));

    // [{ label, value }] for the panel; every row is always there.
    const rows = (v) => {
        const audio = [v.audioCodec, v.channels ? v.channels + ' ch' : null].filter(Boolean).join(' · ');
        const buffer = v.buffer !== null ? v.buffer.toFixed(1) + ' s' : v.bufferPercent !== null ? v.bufferPercent + ' %' : null;
        return [
            [I18n.t('player.info.resolution'), v.width && v.height ? v.width + '×' + v.height : UNKNOWN],
            [I18n.t('player.info.frameRate'), known(v.fps, fpsText)],
            [I18n.t('player.info.video'), v.videoCodec || UNKNOWN],
            [I18n.t('player.audio'), audio || UNKNOWN],
            [I18n.t('player.info.bitrate'), known(v.bitrate, bitrate)],
            [I18n.t('player.info.buffer'), buffer || UNKNOWN],
            [I18n.t('player.info.sound'), sound(v.route)],
            [I18n.t('player.info.dropped'), known(v.dropped, String)],
            [I18n.t('player.info.player'), ENGINES[v.engine] || UNKNOWN],
        ].map((row) => ({ label: row[0], value: row[1] }));
    };

    const { html } = UI;
    const view = (list) => html`<div class="si-title">${I18n.t('player.streamInfo')}</div>
        <div class="si-rows">${list.map((row) => html`<div class="si-row"><span class="si-label">${row.label}</span><span class="si-value">${row.value}</span></div>`)}</div>
        <div class="si-keys"><span><b>Return</b>${I18n.t('player.hide')}</span></div>`;

    // The panel in `root`; sample() is asked every second while it shows.
    const create = (root, sample) => {
        let timer = null;
        let last = null;

        const render = () => {
            const s = sample();
            const v = read(s);
            const frames = s.video && typeof s.video.frames === 'number' ? { frames: s.video.frames, at: Date.now() } : null;
            if (v.fps === null) v.fps = measuredFps(last, frames);
            last = frames;
            UI.render(view(rows(v)), root);
        };

        const hide = () => {
            clearInterval(timer);
            timer = null;
            last = null;
            root.classList.add('hidden');
            UI.clear(root);
        };

        const show = () => {
            if (timer) return;
            root.classList.remove('hidden');
            render();
            timer = setInterval(render, TICK_MS);
        };

        return {
            show,
            hide,
            toggle: () => (timer ? hide() : show()),
            shown: () => !!timer,
        };
    };

    return { create, read, rows, measuredFps, codecName, UNKNOWN };
})();
