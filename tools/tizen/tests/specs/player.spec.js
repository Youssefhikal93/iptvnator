const { test, expect, boot, openFirst, press, playing, sendKeyCode, back, moveTo } = require('./helpers');

test('movie controls pause, play, seek and change speed; track menu and stream info close before player', async ({ page }) => {
    await boot(page);
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await playing(page);
    await press(page, 'Enter');
    await expect.poll(() => page.locator('#video').evaluate(v => v.paused)).toBe(true);
    await sendKeyCode(page, 415);
    await playing(page);
    await press(page, 'ArrowRight');
    await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(10);
    await press(page, 'ArrowUp');
    await expect(page.locator('#pl-menu')).toBeVisible();
    await expect(page.locator('#pl-menu')).toContainText('Audio');
    await expect(page.locator('#pl-menu')).toContainText('No subtitles available');
    await expect(page.locator('#pl-menu')).toContainText('HTML5 video');
    await expect(page.locator('#pl-menu')).toContainText('320');
    for (let i = 0; i < 8; i++) {
        if ((await page.locator('.pl-menu-item.focus').innerText()).includes('1.5')) break;
        await press(page, 'ArrowDown');
    }
    await expect(page.locator('.pl-menu-item.focus')).toContainText('1.5');
    await press(page, 'Enter');
    await expect.poll(() => page.locator('#video').evaluate(v => v.playbackRate)).toBe(1.5);
    await back(page);
    await expect(page.locator('#pl-menu')).toBeHidden();
    await expect(page.locator('#player')).toBeVisible();
    await back(page);
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('#detail')).toBeVisible();
});

test('episode controls skip intro, select another season and play next', async ({ page }) => {
    await boot(page);
    await openFirst(page, 'Series');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-subtitle')).toContainText('S1 E1');
    // Seek via the real media API to reach intro/up-next windows without
    // spending several minutes watching the fixture in each regression run.
    await page.locator('#video').evaluate(v => { v.currentTime = 15; });
    await press(page, 'ArrowDown');
    await expect(page.locator('#pl-buttons .focus')).toHaveText('Skip intro');
    await press(page, 'Enter');
    await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(100);
    await press(page, 'ArrowDown');
    await moveTo(page, '#pl-buttons .focus', 'Episodes', 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#pl-episodes')).toBeVisible();
    await expect(page.locator('.pl-ep-row.playing')).toContainText('S1 E1');
    await press(page, 'ArrowRight');
    await expect(page.locator('.pl-ep-pill.active')).toHaveText('Season 2');
    await expect(page.locator('.pl-ep-row')).toHaveCount(2);
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-subtitle')).toContainText('S2 E1');
    await press(page, 'ArrowDown');
    await moveTo(page, '#pl-buttons .focus', 'Next episode', 'ArrowRight');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-subtitle')).toContainText('S2 E2');
    await back(page);
    await expect(page.locator('#player')).toBeHidden();
});

test('up-next offers the following episode near the end, autoplays on completion and can be cancelled', async ({ page }) => {
    await boot(page, { storage: { settings: { autoplayMs: 5000 } } });
    await openFirst(page, 'Series');
    await press(page, 'Enter');
    await playing(page);
    await page.locator('#video').evaluate(v => { v.currentTime = v.duration - 20; });
    await expect(page.locator('#pl-next')).toBeVisible();
    await expect(page.locator('#pl-next-title')).toContainText('S1 E2');
    await back(page);
    await expect(page.locator('#pl-next')).toBeHidden();
    await expect(page.locator('#player')).toBeVisible();
    // Open the next episode, resetting the dismissed up-next state.
    await press(page, 'ArrowDown');
    await moveTo(page, '#pl-buttons .focus', 'Next episode', 'ArrowRight');
    await press(page, 'Enter');
    await playing(page);
    await page.locator('#video').evaluate(v => { v.currentTime = v.duration - 0.5; });
    await expect(page.locator('#pl-next-count')).toContainText('Playing in');
    await expect(page.locator('#pl-subtitle')).toContainText('S1 E3', { timeout: 15_000 });
    await playing(page);
});
