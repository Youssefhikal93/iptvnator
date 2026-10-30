const { test, expect, boot, section, enterItems, openFirst, press, playing, sendKeyCode, back, playerGroup, playerMenu } = require('./helpers');

const panel = (page) => page.locator('#pl-info');
const value = (page, label) => panel(page).locator('.si-row', { has: page.locator('.si-label', { hasText: new RegExp('^' + label + '$') }) }).locator('.si-value');

// Stream info > Show on screen in the player's menu (opened by the caller).
async function toggleFromMenu(page, state) {
    await playerGroup(page, 'Stream info');
    await expect(page.locator('#pl-menu .pl-menu-item.focus')).toContainText('Show on screen');
    await press(page, 'Enter');
    await expect(page.locator('#pl-menu')).toBeHidden();
    await expect(panel(page)).toBeVisible({ visible: state });
}

test('#84 Stream info shows the live stream in a corner panel, updated every second, never its link; Return or the option hides it', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    // The guide's answer adds Start over to the menu; wait so its rows stay put.
    await expect(page.locator('#pl-epg')).toBeVisible();
    await sendKeyCode(page, 457);
    await expect(page.locator('#pl-menu .pl-menu-group', { hasText: 'Stream info' }).locator('.value')).toHaveText('Off');
    await toggleFromMenu(page, true);
    await expect(panel(page).locator('.si-title')).toHaveText('Stream info');
    await expect(panel(page).locator('.si-label')).toHaveText(['Resolution', 'Frame rate', 'Video', 'Audio', 'Bitrate', 'Buffer', 'Sound', 'Dropped frames', 'Player']);
    await expect(value(page, 'Resolution')).toHaveText(/^\d+×\d+$/);
    await expect(value(page, 'Buffer')).toHaveText(/^\d+\.\d s$/);
    await expect(value(page, 'Dropped frames')).toHaveText(/^\d+$/);
    await expect(value(page, 'Sound')).toHaveText('The stream\'s own');
    // Measured once a second reading arrives.
    await expect(value(page, 'Frame rate')).toHaveText(/fps$/, { timeout: 5000 });
    const text = await panel(page).innerText();
    expect(text).not.toMatch(/localhost|http|tester|secret|\.ts|\.m3u8/);
    // It keeps reading while it shows.
    const reads = await page.evaluate(() => new Promise((done) => {
        const seen = new Set();
        const timer = setInterval(() => seen.add(document.querySelector('#pl-info').innerHTML), 250);
        setTimeout(() => { clearInterval(timer); done(seen.size); }, 2600);
    }));
    expect(reads).toBeGreaterThan(1);
    // Return hides it and leaves the player open.
    await back(page);
    await expect(panel(page)).toBeHidden();
    await expect(page.locator('#player')).toBeVisible();
    // The same option hides it again.
    await sendKeyCode(page, 457);
    await toggleFromMenu(page, true);
    await sendKeyCode(page, 457);
    await expect(page.locator('#pl-menu .pl-menu-group', { hasText: 'Stream info' }).locator('.value')).toHaveText('On');
    await toggleFromMenu(page, false);
    await expect(page.locator('#player')).toBeVisible();
});

test('#84 on the TV the panel reads AVPlay: stream details, the buffering level and the sound route', async ({ page }) => {
    await page.addInitScript(() => {
        window.nativePlayback = { state: 'NONE', listener: null };
        const extra = (value) => JSON.stringify(value);
        window.webapis = { avplay: {
            open: () => { nativePlayback.state = 'IDLE'; },
            setListener: (listener) => { nativePlayback.listener = listener; },
            setDisplayRect: () => {},
            prepareAsync: (success) => success(),
            setSilentSubtitle: () => {},
            play: () => { nativePlayback.state = 'PLAYING'; },
            pause: () => { nativePlayback.state = 'PAUSED'; },
            seekTo: (ms, done) => done(),
            getState: () => nativePlayback.state,
            getCurrentTime: () => 1000,
            getDuration: () => 3600000,
            getTotalTrackInfo: () => [],
            getCurrentStreamInfo: () => [
                { type: 'VIDEO', index: 0, extra_info: extra({ fourCC: 'HEVC', Width: '3840', Height: '2160', Bit_rate: '15000000', framerate: '50' }) },
                { type: 'AUDIO', index: 1, extra_info: extra({ fourCC: 'EAC3', channels: '6', bit_rate: '640000', url: 'http://provider.example/x' }) },
            ],
            stop: () => { nativePlayback.state = 'IDLE'; },
            close: () => { nativePlayback.state = 'NONE'; },
        } };
    });
    await boot(page);
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await expect(page.locator('#player')).toHaveClass(/av/);
    await expect(page.locator('#pl-status')).toBeHidden();
    await playerMenu(page);
    await toggleFromMenu(page, true);
    await expect(value(page, 'Resolution')).toHaveText('3840×2160');
    await expect(value(page, 'Frame rate')).toHaveText('50 fps');
    await expect(value(page, 'Video')).toHaveText('HEVC');
    await expect(value(page, 'Audio')).toHaveText('E-AC-3 · 6 ch');
    await expect(value(page, 'Bitrate')).toHaveText('15.6 Mbps');
    await expect(value(page, 'Buffer')).toHaveText('–');
    await expect(value(page, 'Dropped frames')).toHaveText('–');
    await expect(value(page, 'Player')).toHaveText('Samsung AVPlay');
    await expect(value(page, 'Sound')).toHaveText('The stream\'s own');
    await page.evaluate(() => { nativePlayback.listener.onbufferingstart(); nativePlayback.listener.onbufferingprogress(55); });
    await expect(value(page, 'Buffer')).toHaveText('55 %');
    await page.evaluate(() => nativePlayback.listener.onbufferingcomplete());
    await expect(value(page, 'Buffer')).toHaveText('100 %');
    expect(await panel(page).innerText()).not.toMatch(/provider\.example|http|localhost/);
});
