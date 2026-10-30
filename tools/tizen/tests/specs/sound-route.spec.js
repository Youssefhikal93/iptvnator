const { test, expect, boot, openFirst, press, back, playerMenu, playerGroup } = require('./helpers');

// #54: Samsung TVs cannot decode DTS. The fake AVPlay lists a sound track
// for the file only when it is not DTS-only, and for the provider's
// converted .m3u8 / .ts addresses only when `converted` says they have one.
async function samsungPlayer(page, request, { file = 'dts-only.mkv.head', converted = ['m3u8', 'ts'], refused = false, slowFail = 0, lateError = 0 } = {}) {
    await request.get('/__fail?file=' + file);
    await page.addInitScript(({ dtsOnly, converted, refused, slowFail, lateError }) => {
        const extra = (info) => JSON.stringify(info);
        window.nativePlayback = { state: 'NONE', url: '', opened: [], seeks: [], listener: {} };
        const ext = () => nativePlayback.url.split('.').pop();
        // window.__mkvSound: the TV lists a sound track for the file after all.
        const sound = () => (ext() === 'mkv' ? (window.__mkvSound || !dtsOnly) : converted.includes(ext()));
        window.webapis = { avplay: {
            // Only the last part of the address: the user and password stay out of the test.
            open: (url) => { nativePlayback.url = url; nativePlayback.opened.push(url.split('/').pop()); nativePlayback.state = 'IDLE'; },
            setListener: (listener) => { nativePlayback.listener = listener; },
            setDisplayRect: () => {},
            // A provider that refuses its converted addresses: the TV reports it twice,
            // through onerror and through prepareAsync's error callback.
            prepareAsync: (success, error) => {
                // Like AVPlay, HLS is known by its .m3u8 address only.
                if (!['mkv', 'm3u8', 'ts'].includes(ext())) { nativePlayback.listener.onerror('PLAYER_ERROR_NOT_SUPPORTED_FILE'); return error({ name: 'InvalidAccessError' }); }
                // slowFail: the .m3u8 address fails only after that many ms.
                if (slowFail && ext() === 'm3u8') return setTimeout(() => { nativePlayback.listener.onerror('PLAYER_ERROR_CONNECTION_FAILED'); error({ name: 'Error' }); }, slowFail);
                // lateError: the .m3u8 address opens, then fails that many ms later.
                if (lateError && ext() === 'm3u8') setTimeout(() => { if (ext() === 'm3u8') nativePlayback.listener.onerror('PLAYER_ERROR_CONNECTION_FAILED'); }, lateError);
                // ...and the .ts address that follows lists sound but fails to prepare 3 s later.
                if (lateError && ext() === 'ts') return setTimeout(() => { nativePlayback.listener.onerror('PLAYER_ERROR_CONNECTION_FAILED'); error({ name: 'Error' }); }, 3000);
                if (!refused || ext() === 'mkv') return success();
                nativePlayback.listener.onerror('PLAYER_ERROR_NOT_SUPPORTED_FILE');
                error({ name: 'InvalidAccessError' });
            },
            setSilentSubtitle: () => {},
            play: () => { nativePlayback.state = 'PLAYING'; },
            pause: () => { nativePlayback.state = 'PAUSED'; },
            seekTo: (ms, done) => { nativePlayback.seeks.push(ms); done && done(); },
            getState: () => nativePlayback.state,
            getCurrentTime: () => 40000,
            getDuration: () => 3600000,
            getTotalTrackInfo: () => [{ type: 'VIDEO', index: 0, extra_info: extra({ fourCC: 'H264' }) }]
                .concat(sound() ? [{ type: 'AUDIO', index: 1, extra_info: extra({ language: 'eng', fourCC: 'AAC' }) }] : []),
            getCurrentStreamInfo: () => [],
            setSelectTrack: () => {},
            stop: () => { nativePlayback.state = 'IDLE'; },
            close: () => { nativePlayback.state = 'NONE'; },
        } };
    }, { dtsOnly: file === 'dts-only.mkv.head', converted, refused, slowFail, lateError });
    await boot(page);
}

// Counts the address look-ups for the movie's own link (AVPlay's two-byte
// redirect check), as a provider's one-time redirect needs a fresh one per open.
function lookups(page) {
    let count = 0;
    page.on('request', (req) => {
        if (/\/movie\/.*\/2025\.mkv$/.test(req.url()) && req.headers().range === 'bytes=0-1') count++;
    });
    return () => count;
}
async function startFirstMovie(page) {
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await expect(page.locator('#player')).toHaveClass(/av/);
    await expect(page.locator('#pl-status')).toBeHidden({ timeout: 20_000 });
}

// Back to the movie's page and play it again.
async function playAgain(page) {
    await page.evaluate(() => { nativePlayback.opened = []; });
    for (let i = 0; i < 6 && await page.locator('#player').isVisible(); i++) await back(page);
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('#detail')).toBeVisible();
    await press(page, 'Enter');
    await expect(page.locator('#player')).toHaveClass(/av/);
    await expect(page.locator('#pl-status')).toBeHidden({ timeout: 20_000 });
}

const opened = page => page.evaluate(() => nativePlayback.opened.slice());
const choices = page => page.locator('#pl-menu .pl-menu-item');
const UNSUPPORTED = /This sound format \(DTS\) isn't supported by Samsung TVs/;

test('a DTS-only file opens on the provider\'s converted address, and starts there next time', async ({ page, request }) => {
    await samsungPlayer(page, request);
    await startFirstMovie(page);
    expect(await opened(page)).toEqual(['2025.m3u8']);
    await expect(page.locator('#toast')).toBeHidden();
    await playerMenu(page);
    await playerGroup(page, 'Audio');
    await expect(choices(page)).toHaveText(['English', '●Converted sound (provider)', 'The file\'s own sound']);

    await playAgain(page);
    expect(await opened(page)).toEqual(['2025.m3u8']);
});

test('when no address has sound, the file plays and the viewer is told why, at once next time', async ({ page, request }) => {
    await samsungPlayer(page, request, { converted: [] });
    await startFirstMovie(page);
    expect(await opened(page)).toEqual(['2025.m3u8', '2025.ts', '2025.mkv']);
    await expect(page.locator('#toast')).toHaveText(UNSUPPORTED);

    await playAgain(page);
    expect(await opened(page)).toEqual(['2025.mkv']);
    await expect(page.locator('#toast')).toHaveText(UNSUPPORTED);
});

test('the .ts address is tried when the .m3u8 one has no sound', async ({ page, request }) => {
    await samsungPlayer(page, request, { converted: ['ts'] });
    await startFirstMovie(page);
    expect(await opened(page)).toEqual(['2025.m3u8', '2025.ts']);
    await expect(page.locator('#toast')).toBeHidden();
});

test('a file with playable sound opens as it is; Converted sound in the Audio list reopens there where it was, and back', async ({ page, request }) => {
    await samsungPlayer(page, request, { file: 'tracks.mkv.head' });
    await startFirstMovie(page);
    expect(await opened(page)).toEqual(['2025.mkv']);
    await playerMenu(page);
    await playerGroup(page, 'Audio');
    await expect(choices(page).last()).toHaveText('Converted sound (provider)');
    await page.evaluate(() => { nativePlayback.seeks = []; });
    for (let i = 0; i < 3; i++) await press(page, 'ArrowDown');
    await expect(choices(page).last()).toHaveClass(/focus/);
    await press(page, 'Enter');
    await expect.poll(() => opened(page)).toEqual(['2025.mkv', '2025.m3u8']);
    await expect(page.locator('#pl-status')).toBeHidden({ timeout: 20_000 });
    await expect.poll(() => page.evaluate(() => nativePlayback.seeks)).toContain(40000);

    await playerMenu(page);
    await playerGroup(page, 'Audio');
    await expect(choices(page).last()).toHaveText('The file\'s own sound');
    await press(page, 'ArrowDown');
    await expect(choices(page).last()).toHaveClass(/focus/);
    await press(page, 'Enter');
    await expect.poll(() => opened(page)).toEqual(['2025.mkv', '2025.m3u8', '2025.mkv']);
    await expect(page.locator('#pl-status')).toBeHidden({ timeout: 20_000 });

    // Converted sound again, after the saved choice of the file's own sound.
    await playerMenu(page);
    await playerGroup(page, 'Audio');
    await expect(choices(page).last()).toHaveText('Converted sound (provider)');
    for (let i = 0; i < 3; i++) await press(page, 'ArrowDown');
    await expect(choices(page).last()).toHaveClass(/focus/);
    await press(page, 'Enter');
    await expect.poll(() => opened(page)).toEqual(['2025.mkv', '2025.m3u8', '2025.mkv', '2025.m3u8']);
    await expect(page.locator('#pl-status')).toBeHidden({ timeout: 20_000 });
});

test('a file whose header cannot be read and has no sound five seconds in is tried on the converted address', async ({ page, request }) => {
    await samsungPlayer(page, request);
    // A server that ignores ranges: the header is not read before playing.
    await page.route('**/movie/**/2025.mkv', route => route.fulfill({ status: 200, body: 'not a range answer' }));
    await startFirstMovie(page);
    expect(await opened(page)).toEqual(['2025.mkv']);
    await expect.poll(() => opened(page), { timeout: 15_000 }).toEqual(['2025.mkv', '2025.m3u8']);
    await expect(page.locator('#pl-status')).toBeHidden({ timeout: 20_000 });
});

test('converted addresses the provider refuses are tried once each, then the file plays, and only the file next time', async ({ page, request }) => {
    await samsungPlayer(page, request, { refused: true });
    await startFirstMovie(page);
    expect(await opened(page)).toEqual(['2025.m3u8', '2025.ts', '2025.mkv']);
    await expect(page.locator('#toast')).toHaveText(UNSUPPORTED);

    await playAgain(page);
    expect(await opened(page)).toEqual(['2025.mkv']);
});

test('a file noted as silent plays without the message once the TV lists a sound track, and the note is dropped', async ({ page, request }) => {
    await samsungPlayer(page, request, { converted: [] });
    await startFirstMovie(page);
    await expect(page.locator('#toast')).toHaveText(UNSUPPORTED);
    const notes = () => page.evaluate(() => JSON.parse(localStorage.getItem('iptvnator-tv:audio-route') || '{}'));
    expect(Object.values(await notes())).toEqual(['none']);

    await page.evaluate(() => { window.__mkvSound = true; });
    await expect(page.locator('#toast')).toBeHidden({ timeout: 15_000 });
    await playAgain(page);
    expect(await opened(page)).toEqual(['2025.mkv']);
    await page.waitForTimeout(1000);
    await expect(page.locator('#toast')).toBeHidden();
    expect(await notes()).toEqual({});
});

test('after refused converted addresses the file opens on a fresh one-time link, not the stale first one', async ({ page, request }) => {
    await samsungPlayer(page, request, { refused: true });
    const count = lookups(page);
    await startFirstMovie(page);
    expect(await opened(page)).toEqual(['2025.m3u8', '2025.ts', '2025.mkv']);
    // Once when Play is pressed, once more right before the file opens.
    expect(count()).toBe(2);
});

test('the .m3u8 link goes to AVPlay as it is, so a redirect to an address without .m3u8 still plays with converted sound', async ({ page, request }) => {
    await samsungPlayer(page, request, { converted: ['m3u8'] });
    await page.route('**/2025.m3u8', (route) => route.fulfill({ status: 302, headers: { location: new URL(route.request().url()).origin + '/hls/1/index' } }));
    await page.route('**/hls/**', (route) => route.fulfill({ status: 200, body: '#EXTM3U' }));
    await startFirstMovie(page);
    expect(await opened(page)).toEqual(['2025.m3u8']);
    await expect(page.locator('#toast')).toBeHidden();
});

test('a movie left while its file is still being read never has its sound read under the next movie', async ({ page, request }) => {
    await samsungPlayer(page, request, { file: 'tracks.mkv.head', converted: [] });
    // Movie 25's subtitle-hash reads are slow; the two-byte address check is not.
    await page.route('**/movie/**/2025.mkv', async (route) => {
        const range = route.request().headers().range;
        if (range && range !== 'bytes=0-1') await new Promise((resolve) => setTimeout(resolve, 4000));
        await route.continue().catch(() => {});
    });
    await page.evaluate(() => {
        // The subtitle hash reads the file only with an OpenSubtitles key.
        Prefs.set('opensubtitlesApiKey', 'test-key');
        window.sniffed = [];
        const sniff = MediaSniff.prepare;
        MediaSniff.prepare = (req, url) => { sniffed.push([String(req && req.id), String(url).split('/').pop()]); return sniff(req, url); };
        const hash = MovieHash.prepare;
        MovieHash.prepare = function (req) { window.hashing = window.hashing || req; return hash.apply(this, arguments); };
    });
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await expect.poll(() => page.evaluate(() => !!window.hashing)).toBe(true);
    // While Movie 25's file is still being read, Movie 24 starts.
    await page.evaluate(() => Player.play(JSON.parse(JSON.stringify(window.hashing).split('2025').join('2024'))));
    await page.waitForTimeout(5000);
    const pairs = await page.evaluate(() => sniffed);
    expect(pairs.length).toBeGreaterThan(0);
    for (const [id, file] of pairs) expect(id.replace(/\D/g, '')).toBe(file.replace(/\D/g, ''));
});

test('a silent .m3u8 that fails during its sound check does not judge the .ts address that replaced it', async ({ page, request }) => {
    // The .m3u8 opens without sound and fails 1.5 s into its 4 s check. The
    // .ts lists sound but is still preparing when that check is due, then fails.
    await samsungPlayer(page, request, { converted: ['ts'], lateError: 1500 });
    await startFirstMovie(page);
    // The .m3u8's late check must not take the .ts for a working route: the file is tried.
    await expect.poll(() => opened(page), { timeout: 15_000 }).toEqual(['2025.m3u8', '2025.ts', '2025.mkv']);
});

test('a converted address that fails just before the attempt times out does not reopen AVPlay after the fallback', async ({ page, request }) => {
    test.setTimeout(90_000);
    // The .m3u8 fails at 19.5 s; the attempt ends at 20 s and the chain moves on.
    await samsungPlayer(page, request, { converted: ['ts'], slowFail: 19_500 });
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await expect.poll(() => opened(page)).toEqual(['2025.m3u8']);
    await page.waitForTimeout(24_000);
    // The .ts try was due 1 s after the failure, after the attempt had ended.
    expect(await opened(page)).toEqual(['2025.m3u8']);
});
