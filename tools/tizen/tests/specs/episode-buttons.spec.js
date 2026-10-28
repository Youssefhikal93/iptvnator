const { test, expect, boot, openFirst, press, playing, playerMenu, playerGroup, moveTo } = require('./helpers');

// The show's learnt intro end in ms (0 when none).
const learnt = page => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem(ProfileStore.key('intros')) || '{}'))[0] || 0);
const at = page => page.locator('#video').evaluate(v => v.currentTime);

async function startShow(page) {
    await boot(page);
    await openFirst(page, 'Series');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-subtitle')).toContainText('S1 E1');
}

test('Previous and Next sit after play/pause in a show and change the episode', async ({ page }) => {
    await startShow(page);
    // The first episode has no Previous.
    await expect(page.locator('#pl-buttons .pl-btn')).toHaveText(['Next', 'Start over', 'Audio & subtitles', 'Episodes', '']);
    await press(page, 'ArrowRight');
    await expect(page.locator('#pl-buttons .focus')).toHaveText('Next');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-subtitle')).toContainText('S1 E2');
    await expect(page.locator('#pl-buttons .pl-btn').first()).toHaveText('Previous');
    await press(page, 'ArrowRight');
    await expect(page.locator('#pl-buttons .focus')).toHaveText('Previous');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-subtitle')).toContainText('S1 E1');
});

test('a movie has neither Previous nor Next', async ({ page }) => {
    await boot(page);
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-buttons .pl-btn')).toHaveText(['Start over', 'Audio & subtitles', '']);
});

test('Skip intro learns where the show\'s intro ends, a jump right after corrects it, and the menu forgets it', async ({ page }) => {
    await startShow(page);
    await page.locator('#video').evaluate(v => { v.currentTime = 15; });
    await press(page, 'ArrowUp');
    await press(page, 'ArrowUp');
    await expect(page.locator('#pl-skip')).toHaveClass(/focus/);
    // The first skip jumps the usual 90 s, to 1:45.
    await press(page, 'Enter');
    await expect.poll(() => at(page)).toBeGreaterThanOrEqual(104);
    // Ten seconds back on the timeline: the intro really ends at 1:35.
    await press(page, 'ArrowLeft');
    await expect.poll(() => at(page)).toBeLessThan(100);
    await expect.poll(() => learnt(page)).toBeGreaterThan(94000);
    expect(await learnt(page)).toBeLessThan(96000);

    // The next episode skips straight to 1:35.
    await press(page, 'ArrowDown');
    await moveTo(page, '#pl-buttons .focus', 'Next', 'ArrowRight');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-subtitle')).toContainText('S1 E2');
    await page.locator('#video').evaluate(v => { v.currentTime = 15; });
    await press(page, 'ArrowUp');
    await press(page, 'ArrowUp');
    await press(page, 'Enter');
    await expect.poll(() => at(page)).toBeGreaterThanOrEqual(94);
    expect(await at(page)).toBeLessThan(100);

    // ▲ ▲ menu: Intro · Ends at 1:35, and Forget clears it.
    await playerMenu(page);
    await expect(page.locator('#pl-menu .pl-menu-group', { hasText: 'Intro' }).locator('.value')).toHaveText('Ends at 1:35');
    await playerGroup(page, 'Intro');
    await press(page, 'Enter');
    await expect(page.locator('#toast')).toContainText('Intro forgotten');
    expect(await learnt(page)).toBe(0);
});
