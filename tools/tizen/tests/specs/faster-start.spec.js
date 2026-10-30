const { test, expect, boot, openFirst, press, back, moveTo } = require('./helpers');

// #70: opening a film or an episode, and Next, skip what is already known
// and log one timing line per open. The fake AVPlay lists a sound track for a
// file unless `dtsOnly`, and for a converted address when `converted` has it.
async function fakeTv(page, request, { file = 'tracks.mkv.head', converted = ['m3u8', 'ts'] } = {}) {
    await request.get('/__fail?file=' + file);
    await page.addInitScript(({ dtsOnly, converted }) => {
        window.nativePlayback = { state: 'NONE', opened: [], url: '', listener: {} };
        const ext = () => nativePlayback.url.split('.').pop();
        const sound = () => (['mkv', 'mp4'].includes(ext()) ? !dtsOnly : converted.includes(ext()));
        window.webapis = { avplay: {
            open: (url) => { nativePlayback.url = url; nativePlayback.opened.push(url.split('/').pop()); nativePlayback.state = 'IDLE'; },
            setListener: (listener) => { nativePlayback.listener = listener; },
            setDisplayRect: () => {},
            prepareAsync: (success) => success(),
            setSilentSubtitle: () => {},
            play: () => { nativePlayback.state = 'PLAYING'; },
            pause: () => {},
            seekTo: (ms, done) => { done && done(); },
            getState: () => nativePlayback.state,
            getCurrentTime: () => 40000,
            getDuration: () => 3600000,
            getTotalTrackInfo: () => [{ type: 'VIDEO', index: 0, extra_info: JSON.stringify({ fourCC: 'H264' }) }]
                .concat(sound() ? [{ type: 'AUDIO', index: 1, extra_info: JSON.stringify({ language: 'eng', fourCC: 'AAC' }) }] : []),
            getCurrentStreamInfo: () => [],
            setSelectTrack: () => {},
            stop: () => { nativePlayback.state = 'IDLE'; },
            close: () => { nativePlayback.state = 'NONE'; },
        } };
    }, { dtsOnly: file === 'dts-only.mkv.head', converted });
    // Subtitle look-ups go to a provider on the internet; none is wanted here.
    await page.route(/opensubtitles|subdl|subsource/, route => route.abort());
}

// The timing lines the app logs, and the ranged file reads (not the two-byte
// address look-up) made for each file name.
function watch(page) {
    const lines = [];
    const reads = [];
    page.on('console', (message) => { if (/^INFO OPEN timing /.test(message.text())) { lines.push(message.text().replace(/^INFO /, '')); if (process.env.TV_SHOW_TIMING) console.log(lines[lines.length - 1]); } });
    page.on('request', (req) => {
        const range = req.headers().range;
        if (/\/(movie|series)\//.test(req.url()) && range && range !== 'bytes=0-1') reads.push(req.url().split('/').pop());
    });
    return { lines, reads };
}

const opened = page => page.evaluate(() => nativePlayback.opened.slice());
const started = page => expect(page.locator('#pl-status')).toBeHidden({ timeout: 20_000 });
const WITH_KEY = { storage: { 'shared-settings': { opensubtitlesApiKey: 'test-key' } } };

async function startFirst(page, section) {
    await openFirst(page, section);
    await press(page, 'Enter');
    await expect(page.locator('#player')).toHaveClass(/av/);
    await started(page);
}

async function next(page) {
    await press(page, 'ArrowRight');
    await moveTo(page, '#pl-buttons .focus', 'Next', 'ArrowRight');
    await press(page, 'Enter');
}

test('the second open of the same film skips the hash and the sound check, and logs why', async ({ page, request }) => {
    await fakeTv(page, request);
    await boot(page, WITH_KEY);
    const seen = watch(page);
    await startFirst(page, 'Movies');
    await expect.poll(() => seen.lines.length).toBe(1);
    // The header is read once, for the hash and the sound check together (the fake's file is too small to hash).
    expect(seen.reads).toEqual(['2025.mkv']);
    expect(seen.lines[0]).toMatch(/^OPEN timing film resolve=\d+ hash=\d+ sniff=\d+ prepare=\d+ total=\d+$/);

    for (let i = 0; i < 6 && await page.locator('#player').isVisible(); i++) await back(page);
    await expect(page.locator('#detail')).toBeVisible();
    await press(page, 'Enter');
    await expect(page.locator('#player')).toHaveClass(/av/);
    await started(page);
    await expect.poll(() => seen.lines.length).toBe(2);
    expect(seen.reads).toEqual(['2025.mkv']);
    expect(seen.lines[1]).toMatch(/^OPEN timing film resolve=\d+ hash=cached sniff=cached prepare=\d+ total=\d+$/);
});

test('Next episode of a show whose episodes share their sound is not read, and says so', async ({ page, request }) => {
    await fakeTv(page, request);
    await boot(page);
    const seen = watch(page);
    await startFirst(page, 'Series');
    await expect(page.locator('#pl-subtitle')).toContainText('S1 E1');
    await next(page);
    await expect(page.locator('#pl-subtitle')).toContainText('S1 E2');
    await started(page);
    await expect.poll(() => seen.lines.length).toBe(2);
    // Two episodes gave the same tracks: the third is not read.
    await page.evaluate(() => { nativePlayback.opened = []; });
    await next(page);
    await expect(page.locator('#pl-subtitle')).toContainText('S1 E3');
    await started(page);
    await expect.poll(() => seen.lines.length).toBe(3);
    expect(seen.reads).toEqual(['4001.mp4', '4002.mp4']);
    expect(seen.lines[0]).toMatch(/^OPEN timing episode resolve=\d+ hash=off sniff=\d+ prepare=\d+ total=\d+$/);
    expect(seen.lines[1]).toMatch(/^OPEN timing next resolve=\d+ hash=off sniff=\d+ prepare=\d+ total=\d+$/);
    expect(seen.lines[2]).toMatch(/^OPEN timing next resolve=\d+ hash=off sniff=show prepare=\d+ total=\d+$/);
    expect(await opened(page)).toEqual(['4003.mp4']);
});

test('a file whose sound the TV cannot play still plays on a converted route, and the timing line shows each try', async ({ page, request }) => {
    await fakeTv(page, request, { file: 'dts-only.mkv.head', converted: ['ts'] });
    await boot(page);
    const seen = watch(page);
    await startFirst(page, 'Movies');
    expect(await opened(page)).toEqual(['2025.m3u8', '2025.ts']);
    await expect.poll(() => seen.lines.length).toBe(1);
    // The .m3u8 has no sound: a pause for the provider, then the .ts.
    expect(seen.lines[0]).toMatch(/^OPEN timing film resolve=\d+ hash=off sniff=\d+ prepare=\d+ gap=\d+ ts=\d+ total=\d+$/);
    expect(Number(/gap=(\d+)/.exec(seen.lines[0])[1])).toBeGreaterThanOrEqual(900);
});

test('Next episode starts on the converted address that worked for the show, without trying the other first', async ({ page, request }) => {
    await fakeTv(page, request, { file: 'dts-only.mkv.head', converted: ['ts'] });
    await boot(page);
    const seen = watch(page);
    await startFirst(page, 'Series');
    expect(await opened(page)).toEqual(['4001.m3u8', '4001.ts']);
    await page.evaluate(() => { nativePlayback.opened = []; });
    await next(page);
    await expect(page.locator('#pl-subtitle')).toContainText('S1 E2');
    await started(page);
    expect(await opened(page)).toEqual(['4002.ts']);
    await expect.poll(() => seen.lines.length).toBe(2);
    expect(seen.lines[1]).toMatch(/^OPEN timing next resolve=\d+ hash=off sniff=\d+ prepare=\d+ total=\d+$/);
});

test('the timing line holds no address, host, login or title', async ({ page, request }) => {
    await fakeTv(page, request);
    await boot(page, WITH_KEY);
    const seen = watch(page);
    await startFirst(page, 'Movies');
    await expect.poll(() => seen.lines.length).toBe(1);
    expect(seen.lines[0]).toMatch(/^OPEN timing [a-z]+( [a-z0-9]+=[a-z0-9]+)+$/);
    expect(seen.lines[0]).not.toMatch(/localhost|http|tester|secret|Movie|2025|\//);
});
