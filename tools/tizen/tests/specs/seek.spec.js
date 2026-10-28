const { test, expect, boot, openFirst, press } = require('./helpers');

// Samsung AVPlay lands near, not on, the asked time (the key frame before it),
// and keeps reporting the old time until the seek has finished.
async function samsungPlayer(page) {
    await page.addInitScript(() => {
        window.nativePlayback = { state: 'NONE', position: 40000, seeks: [] };
        window.webapis = { avplay: {
            open: () => { nativePlayback.state = 'IDLE'; },
            setListener: () => {},
            setDisplayRect: () => {},
            prepareAsync: success => success(),
            setSilentSubtitle: () => {},
            play: () => { nativePlayback.state = 'PLAYING'; },
            pause: () => { nativePlayback.state = 'PAUSED'; },
            seekTo: (ms, done) => {
                nativePlayback.seeks.push(ms);
                setTimeout(() => {
                    nativePlayback.position = Math.floor(ms / 12000) * 12000;
                    done();
                }, 1500);
            },
            getState: () => nativePlayback.state,
            getCurrentTime: () => nativePlayback.position,
            getDuration: () => 3600000,
            getTotalTrackInfo: () => [],
            getCurrentStreamInfo: () => [],
            stop: () => { nativePlayback.state = 'IDLE'; },
            close: () => { nativePlayback.state = 'NONE'; },
        } };
    });
    await page.clock.install();
    await boot(page);
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await expect(page.locator('#player')).toHaveClass(/av/);
    await expect(page.locator('#pl-status')).toBeHidden();
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
}

const seeks = page => page.evaluate(() => nativePlayback.seeks.slice());

test('a +10 jump is sent once even when the TV lands a few seconds before the target', async ({ page }) => {
    await samsungPlayer(page);
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    await page.clock.runFor(400);
    expect(await seeks(page)).toEqual([70000]);
    // It lands on 1:00, ten seconds short; asking again only restarts the loading.
    await page.clock.runFor(10000);
    expect(await seeks(page)).toEqual([70000]);
    expect(await page.evaluate(() => nativePlayback.position)).toBe(60000);
});

test('a press while the last jump still loads counts from where that jump went', async ({ page }) => {
    await samsungPlayer(page);
    await press(page, 'ArrowRight');
    await page.clock.runFor(400);
    expect(await seeks(page)).toEqual([50000]);
    // The TV still reports 0:40 while it loads 0:50.
    await page.clock.runFor(300);
    await press(page, 'ArrowRight');
    await page.clock.runFor(400);
    expect(await seeks(page)).toEqual([50000, 60000]);
});
