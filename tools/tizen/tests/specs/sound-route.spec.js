const { test, expect, boot, openFirst, press, back, playerMenu, playerGroup } = require('./helpers');

// #54: Samsung TVs cannot decode DTS. The fake AVPlay lists a sound track
// for the file only when it is not DTS-only, and for the provider's
// converted .m3u8 / .ts addresses only when `converted` says they have one.
async function samsungPlayer(page, request, { file = 'dts-only.mkv.head', converted = ['m3u8', 'ts'] } = {}) {
    await request.get('/__fail?file=' + file);
    await page.addInitScript(({ dtsOnly, converted }) => {
        const extra = (info) => JSON.stringify(info);
        window.nativePlayback = { state: 'NONE', url: '', opened: [], seeks: [] };
        const ext = () => nativePlayback.url.split('.').pop();
        const sound = () => (ext() === 'mkv' ? !dtsOnly : converted.includes(ext()));
        window.webapis = { avplay: {
            // Only the last part of the address: the user and password stay out of the test.
            open: (url) => { nativePlayback.url = url; nativePlayback.opened.push(url.split('/').pop()); nativePlayback.state = 'IDLE'; },
            setListener: () => {},
            setDisplayRect: () => {},
            prepareAsync: success => success(),
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
    }, { dtsOnly: file === 'dts-only.mkv.head', converted });
    await boot(page);
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
