const { test, expect, boot, openFirst, press, playing, playerMenu, playerGroup, moveTo, learntIntro } = require('./helpers');

// Season 1's intro { from, to } in ms (0 when none).
const learnt = page => learntIntro(page, 1);
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

test('a skip by hand teaches the intro; the next episode offers Skip intro there, a jump right after corrects it, and the menu forgets it', async ({ page }) => {
    await startShow(page);
    // Nothing learnt yet: no Skip intro anywhere in the first minutes (paused, so the times are exact).
    await page.locator('#video').evaluate(v => { v.pause(); v.currentTime = 15; });
    await page.waitForTimeout(700);
    await expect(page.locator('#pl-skip')).toBeHidden();
    // ▲ to the timeline and ▶ ▶ ▶: 0:15 -> 0:45 is the intro.
    await press(page, 'ArrowUp');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    await expect.poll(() => learnt(page)).toEqual({ from: 15000, to: 45000 });
    await expect(page.locator('#pl-skip')).toBeHidden();

    // The next episode at 0:16 (in the intro) offers Skip intro, which jumps to 0:45.
    await press(page, 'ArrowDown');
    await moveTo(page, '#pl-buttons .focus', 'Next', 'ArrowRight');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-subtitle')).toContainText('S1 E2');
    await page.locator('#video').evaluate(v => { v.pause(); v.currentTime = 16; });
    await expect(page.locator('#pl-skip')).toBeVisible();
    await press(page, 'ArrowUp');
    await press(page, 'ArrowUp');
    await expect(page.locator('#pl-skip')).toHaveClass(/focus/);
    await press(page, 'Enter');
    await expect.poll(() => at(page)).toBeGreaterThanOrEqual(44);
    // Ten seconds back right after: the intro really ends at 0:35.
    await press(page, 'ArrowLeft');
    await expect.poll(() => learnt(page)).toEqual({ from: 15000, to: 35000 });

    // ▲ ▲ menu: Intro · 00:15–00:35, and Reset clears it (#102).
    await playerMenu(page);
    await expect(page.locator('#pl-menu .pl-menu-group', { hasText: 'Intro' }).locator('.value')).toHaveText('00:15–00:35');
    await playerGroup(page, 'Intro');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await expect(page.locator('#pl-menu .pl-menu-item.focus')).toContainText('Reset');
    await press(page, 'Enter');
    await expect(page.locator('#toast')).toContainText('Reset');
    expect(await learnt(page)).toBe(0);
});
