const { test, expect, playerMenu, boot, openFirst, press, playing, sendKeyCode, back, moveTo, playerGroup } = require('./helpers');

test('movie controls pause, play, seek and change speed; track menu and stream info close before player', async ({ page }) => {
    await boot(page);
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await playing(page);
    await press(page, 'Enter');
    await expect.poll(() => page.locator('#video').evaluate(v => v.paused)).toBe(true);
    await back(page);
    await expect(page.locator('#pl-controls')).toBeHidden();
    await page.waitForTimeout(1000); // Cross player ticks while paused.
    await expect(page.locator('#pl-controls')).toBeHidden();
    expect(await page.locator('#video').evaluate(v => v.paused)).toBe(true);
    await sendKeyCode(page, 415);
    await playing(page);
    // ◀ ▶ walk the buttons; ▲ puts the focus on the timeline, where they seek.
    await press(page, 'ArrowRight');
    await expect(page.locator('#pl-buttons .focus')).toHaveText('Start over');
    await press(page, 'ArrowUp');
    await expect(page.locator('#pl-seekbox')).toHaveClass(/focus/);
    await press(page, 'ArrowRight');
    await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(10);
    await playerMenu(page);
    // Groups with their values first; OK opens one, Return goes back (#48).
    await expect(page.locator('#pl-menu .pl-menu-group .label').first()).toHaveText('Audio');
    await expect(page.locator('#pl-menu .pl-menu-group', { hasText: 'Playback speed' }).locator('.value')).toHaveText('1×');
    await playerGroup(page, 'Subtitles');
    // A movie can always look online, so the group offers that instead of "none".
    await expect(page.locator('#pl-menu')).toContainText('Find subtitles online…');
    await back(page);
    await playerGroup(page, 'Stream info');
    await expect(page.locator('#pl-menu')).toContainText('HTML5 video');
    await expect(page.locator('#pl-menu')).toContainText('320');
    await press(page, 'ArrowLeft');
    await playerGroup(page, 'Playback speed');
    await moveTo(page, '.pl-menu-item.focus span:last-child', '1.5×');
    await expect(page.locator('.pl-menu-item.focus')).toContainText('1.5');
    await press(page, 'Enter');
    await expect.poll(() => page.locator('#video').evaluate(v => v.playbackRate)).toBe(1.5);
    await back(page);
    await expect(page.locator('#pl-menu .pl-menu-group.focus .value')).toHaveText('1.5×');
    await back(page);
    await expect(page.locator('#pl-menu')).toBeHidden();
    await expect(page.locator('#player')).toBeVisible();
    await back(page);
    await expect(page.locator('#pl-controls')).toBeHidden();
    await back(page);
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('#detail')).toBeVisible();
});

test('the movie bar has play/pause, Start over, Audio & subtitles and a settings gear; each opens its part of the menu', async ({ page }) => {
    await boot(page);
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-hint')).toBeEmpty();
    await press(page, 'ArrowRight');
    // A movie has no Episodes button.
    await expect(page.locator('#pl-buttons .pl-btn')).toHaveCount(3);
    await expect(page.locator('#pl-buttons .focus')).toHaveText('Start over');
    await page.locator('#video').evaluate(v => { v.currentTime = 30; });
    await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(30);
    await press(page, 'Enter');
    await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeLessThan(5);
    await press(page, 'ArrowDown');
    await press(page, 'ArrowRight');
    await expect(page.locator('#pl-buttons .focus')).toHaveText('Audio & subtitles');
    await press(page, 'Enter');
    await expect(page.locator('#pl-menu .pl-menu-title')).toHaveText('Audio & subtitles');
    await expect(page.locator('#pl-menu .pl-menu-group .label')).toHaveText(['Audio', 'Subtitles', 'Subtitle style']);
    await back(page);
    await expect(page.locator('#pl-menu')).toBeHidden();
    await press(page, 'ArrowDown');
    await moveTo(page, '#pl-buttons .focus', '', 'ArrowRight');
    await expect(page.locator('#pl-buttons .focus')).toHaveAttribute('aria-label', 'Settings');
    await press(page, 'Enter');
    await expect(page.locator('#pl-menu .pl-menu-title')).toHaveText('Settings');
    await expect(page.locator('#pl-menu')).toContainText('Playback speed');
    await expect(page.locator('#pl-menu .pl-menu-group .label', { hasText: /^Audio$/ })).toHaveCount(0);
    await back(page);
    // ▲ ▲ still opens the whole menu.
    await playerMenu(page);
    await expect(page.locator('#pl-menu .pl-menu-group .label').first()).toHaveText('Audio');
    await expect(page.locator('#pl-menu')).toContainText('Playback speed');
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
    // Skip intro floats above the timeline, not in the row: ▲ ▲ reach it.
    await press(page, 'ArrowUp');
    await press(page, 'ArrowUp');
    await expect(page.locator('#pl-buttons')).not.toContainText('Skip intro');
    await expect(page.locator('#pl-skip')).toHaveClass(/focus/);
    await press(page, 'ArrowDown');
    await expect(page.locator('#pl-seekbox')).toHaveClass(/focus/);
    await press(page, 'ArrowDown');
    await press(page, 'ArrowRight');
    await expect(page.locator('#pl-buttons .focus')).toHaveText('Start over');
    await press(page, 'ArrowUp');
    await press(page, 'ArrowUp');
    await expect(page.locator('#pl-skip')).toHaveClass(/focus/);
    await press(page, 'Enter');
    await expect(page.locator('#pl-skip')).toBeHidden();
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
    // The next episode, from the Episodes panel.
    await moveTo(page, '#pl-buttons .focus', 'Episodes', 'ArrowRight');
    await press(page, 'Enter');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-subtitle')).toContainText('S2 E2');
    await back(page);
    await expect(page.locator('#pl-controls')).toBeHidden();
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
    // The next episode, from the Episodes panel.
    await moveTo(page, '#pl-buttons .focus', 'Episodes', 'ArrowRight');
    await press(page, 'Enter');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await playing(page);
    await page.locator('#video').evaluate(v => { v.currentTime = v.duration - 0.5; });
    await expect(page.locator('#pl-next-count')).toContainText('Playing in');
    await expect(page.locator('#pl-subtitle')).toContainText('S1 E3', { timeout: 15_000 });
    await playing(page);
});
