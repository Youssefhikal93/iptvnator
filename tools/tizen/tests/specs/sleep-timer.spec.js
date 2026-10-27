const { test, expect, boot, openFirst, press, playing, sendKeyCode, back, moveTo, section, enterItems, savedProgress, playerGroup } = require('./helpers');

async function start(page, name = 'Movies', seed) {
    await page.clock.install();
    await boot(page, seed);
    await openFirst(page, name);
    await press(page, 'Enter');
    await playing(page);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
}

async function choose(page, label, live = false) {
    if (live) await sendKeyCode(page, 405);
    else await press(page, 'ArrowUp');
    await playerGroup(page, 'Sleep timer');
    await moveTo(page, '#pl-menu .focus span:last-child', label);
    await press(page, 'Enter');
    await expect(page.locator('#pl-menu .active span:last-child').filter({ hasText: new RegExp('^' + label + '$') })).toHaveCount(1);
    await back(page);
    await back(page);
}

async function seekNearEnd(page, seconds) {
    await page.locator('#video').evaluate((v, seconds) => { v.currentTime = v.duration - seconds; }, seconds);
    await expect.poll(() => page.locator('#video').evaluate(v => !v.seeking)).toBe(true);
    await page.clock.runFor(1000);
}

async function released(page) {
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('#video')).not.toHaveAttribute('src');
    expect(await page.locator('#video').evaluate(v => v.paused)).toBe(true);
    expect(await page.evaluate(() => Player.isOpen())).toBe(false);
}

test('#22 15 minutes warns after 14, Keep watching extends, expiry releases playback and returns to browser', async ({ page }) => {
    await start(page);
    await page.locator('#video').evaluate(v => { v.currentTime = 40; });
    await expect.poll(() => page.locator('#video').evaluate(v => !v.seeking)).toBe(true);
    await choose(page, '15 min');
    await expect(page.locator('#pl-sleep-badge')).toHaveText('Sleep in 15 min');
    await page.clock.fastForward(14 * 60000);
    await expect(page.locator('#pl-sleep-count')).toHaveText('Playback stops in 60 s');
    await expect(page.locator('#pl-sleep-keep')).toBeFocused();
    await page.clock.runFor(1000);
    await expect(page.locator('#pl-sleep-count')).toHaveText('Playback stops in 59 s');
    await press(page, 'Enter');
    await expect(page.locator('#pl-sleep-warning')).toBeHidden();
    await press(page, 'ArrowUp');
    await expect(page.locator('#pl-menu .pl-menu-group .label', { hasText: 'Sleep timer' })).toHaveText('Sleep timer · 16 min left');
    await expect(page.locator('#pl-sleep-badge')).toHaveText('Sleep in 16 min');
    await back(page);
    await page.clock.fastForward(15 * 60000);
    await expect(page.locator('#pl-sleep-count')).toHaveText('Playback stops in 59 s');
    await page.clock.fastForward(59000);
    await released(page);
    await expect(page.locator('#detail')).toBeVisible();
    await expect(page.locator('#toast')).toHaveText('Sleep timer stopped playback');
    expect((await savedProgress(page, 'movie:2025')).position).toBeGreaterThan(0);
    await back(page);
    await expect(page.locator('#detail')).toBeHidden();
});

test('#22 End of episode saves watched progress and stops instead of autoplaying', async ({ page }) => {
    let nextRequests = 0;
    page.on('request', request => { if (new URL(request.url()).pathname.includes('/series/tester/secret/4002.')) nextRequests++; });
    await start(page, 'Series', { storage: { settings: { autoplayMs: 1000 } } });
    await choose(page, 'End of episode');
    await seekNearEnd(page, 59);
    await expect(page.locator('#pl-sleep-warning')).toBeVisible();
    await expect(page.locator('#pl-sleep-keep')).toBeFocused();
    await seekNearEnd(page, 20);
    await expect(page.locator('#pl-next')).toBeHidden();
    await seekNearEnd(page, 0.1);
    await released(page);
    await page.clock.fastForward(5000);
    expect(nextRequests).toBe(0);
    const progress = await savedProgress(page, 'episode:4001');
    expect(progress.position).toBe(progress.duration);
    await expect(page.locator('#toast')).toHaveText('Sleep timer stopped playback');
});

test('#22 Return on the end warning means Keep watching and restores autoplay', async ({ page }) => {
    await start(page, 'Series', { storage: { settings: { autoplayMs: 1000 } } });
    await choose(page, 'End of episode');
    await seekNearEnd(page, 50);
    await expect(page.locator('#pl-sleep-warning')).toBeVisible();
    await back(page);
    await expect(page.locator('#pl-sleep-warning')).toBeHidden();
    await expect(page.locator('#player')).toBeVisible();
    await expect(page.locator('#pl-sleep-badge')).toBeHidden();
    await seekNearEnd(page, 0.1);
    await expect(page.locator('#pl-next-count')).toContainText('Playing in');
    await page.clock.runFor(1500);
    await expect(page.locator('#pl-subtitle')).toContainText('S1 E2');
    await playing(page);
});

test('#22 a duration survives changing episodes but Return cancels it and reload starts Off', async ({ page }) => {
    await start(page, 'Series');
    await choose(page, '30 min');
    await press(page, 'ArrowDown');
    await moveTo(page, '#pl-buttons .focus', 'Next episode', 'ArrowRight');
    await press(page, 'Enter');
    await playing(page);
    await page.clock.fastForward(60000);
    await press(page, 'ArrowUp');
    await expect(page.locator('#pl-menu .pl-menu-group .label', { hasText: 'Sleep timer' })).toHaveText('Sleep timer · 29 min left');
    await back(page);
    await back(page);
    await expect(page.locator('#pl-controls')).toBeHidden();
    await back(page);
    await released(page);
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-resume')).toBeHidden();
    await expect(page.locator('#pl-sleep-badge')).toBeHidden();
    await choose(page, '15 min');
    await page.reload();
    await expect(page.locator('#player')).toBeHidden();
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await playing(page);
    await press(page, 'ArrowUp');
    // Downloaded subtitles and the sleep timer both start Off.
    await expect(page.locator('#pl-menu .pl-menu-group .value').filter({ hasText: /^Off$/ })).toHaveCount(2);
});

test('#22 live zapping keeps the timer; Return to live preview cancels it', async ({ page }) => {
    await boot(page, { livePreview: true });
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await press(page, 'Enter');
    await expect(page.locator('#player')).not.toHaveClass(/preview/);
    await choose(page, '15 min', true);
    await sendKeyCode(page, 427);
    await playing(page);
    await sendKeyCode(page, 405);
    await expect(page.locator('#pl-sleep-badge')).toHaveText('Sleep in 15 min');
    await playerGroup(page, 'Sleep timer');
    await expect(page.locator('#pl-menu')).not.toContainText('End of');
    await back(page);
    await back(page);
    await back(page);
    await expect(page.locator('#pl-controls')).toBeHidden();
    await back(page);
    await expect(page.locator('#player')).toHaveClass(/preview/);
    await expect(page.locator('#pl-sleep-badge')).toHaveClass(/hidden/);
});

test('#22 Stop now closes Samsung AVPlay before asking Tizen to exit', async ({ page }) => {
    await page.addInitScript(() => {
        window.nativePlayback = { state: 'NONE', position: 40000, closed: false };
        window.webapis = { avplay: {
            open: () => { nativePlayback.state = 'IDLE'; },
            setListener: () => {},
            setDisplayRect: () => {},
            prepareAsync: success => success(),
            setSilentSubtitle: () => {},
            play: () => { nativePlayback.state = 'PLAYING'; },
            getState: () => nativePlayback.state,
            getCurrentTime: () => nativePlayback.position,
            getDuration: () => 300000,
            getTotalTrackInfo: () => [],
            getCurrentStreamInfo: () => [],
            stop: () => { nativePlayback.state = 'IDLE'; },
            close: () => { nativePlayback.state = 'NONE'; nativePlayback.closed = true; },
        } };
        window.tizen = { application: { getCurrentApplication: () => ({ exit: () => {
            window.sleepExit = { open: Player.isOpen(), state: nativePlayback.state, closed: nativePlayback.closed };
        } }) } };
    });
    await page.clock.install();
    await boot(page);
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await expect(page.locator('#player')).toHaveClass(/av/);
    await expect(page.locator('#pl-status')).toBeHidden();
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await choose(page, 'End of movie');
    await page.evaluate(() => { nativePlayback.position = 250000; });
    await page.clock.runFor(1000);
    await expect(page.locator('#pl-sleep-keep')).toBeFocused();
    await press(page, 'ArrowRight');
    await expect(page.locator('#pl-sleep-stop')).toBeFocused();
    await press(page, 'Enter');
    await released(page);
    expect(await page.evaluate(() => window.sleepExit)).toEqual({ open: false, state: 'NONE', closed: true });
    expect((await savedProgress(page, 'movie:2025')).position).toBe(250);
});
