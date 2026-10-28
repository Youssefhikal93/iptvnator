const { test, expect, boot, openFirst, press, playing, moveTo } = require('./helpers');

const skip = page => page.locator('#pl-skip');

// The episode on screen at 0:15, inside the intro window; paused unless asked.
async function atIntro(page, keepPlaying) {
    await page.locator('#video').evaluate((v, play) => { if (!play) v.pause(); v.currentTime = 15; }, !!keepPlaying);
}

// The first episode of the first show, with the page clock held.
async function startEpisode(page, keepPlaying) {
    await page.clock.install();
    await boot(page);
    await openFirst(page, 'Series');
    await press(page, 'Enter');
    await playing(page);
    await atIntro(page, keepPlaying);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
}

test('Skip intro shows for 5 seconds and then hides when it is not pressed', async ({ page }) => {
    await startEpisode(page);
    await page.clock.runFor(600);
    await expect(skip(page)).toBeVisible();
    await page.clock.runFor(3000);
    await expect(skip(page)).toBeVisible();
    await page.clock.runFor(2500);
    await expect(skip(page)).toBeHidden();
    // ▲ ▲ now opens the menu: there is no Skip intro to reach.
    await press(page, 'ArrowUp');
    await press(page, 'ArrowUp');
    await expect(skip(page)).toBeHidden();
    await expect(page.locator('#pl-menu')).toBeVisible();
});

test('bringing the controls up during the intro shows Skip intro for another 5 seconds', async ({ page }) => {
    // Playing: the controls only hide on their own while the video plays.
    await startEpisode(page, true);
    await page.clock.runFor(6000);
    await expect(skip(page)).toBeHidden();
    // The controls hide on their own, then a key brings them up again.
    await page.clock.runFor(10000);
    await expect(page.locator('#pl-controls')).toBeHidden();
    await press(page, 'ArrowDown');
    await expect(page.locator('#pl-controls')).toBeVisible();
    await page.clock.runFor(600);
    await expect(skip(page)).toBeVisible();
    await page.clock.runFor(5000);
    await expect(skip(page)).toBeHidden();
});

test('a focused Skip intro stays until it is used or left', async ({ page }) => {
    await startEpisode(page);
    await page.clock.runFor(600);
    await press(page, 'ArrowUp');
    await press(page, 'ArrowUp');
    await expect(skip(page)).toHaveClass(/focus/);
    await page.clock.runFor(8000);
    await expect(skip(page)).toBeVisible();
    await press(page, 'ArrowDown');
    await page.clock.runFor(600);
    await expect(skip(page)).toBeHidden();
});

test('with an intro end learnt from an earlier episode, Skip intro still hides after 5 seconds', async ({ page }) => {
    await startEpisode(page);
    await page.clock.runFor(600);
    // Episode 1: skipping learns that this show's intro ends at 1:45.
    await press(page, 'ArrowUp');
    await press(page, 'ArrowUp');
    await press(page, 'Enter');
    await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(104);
    // Episode 2 at 0:15: the learnt end is 90 s away, but the button goes after 5 s.
    await press(page, 'ArrowDown');
    await moveTo(page, '#pl-buttons .focus', 'Next', 'ArrowRight');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-subtitle')).toContainText('S1 E2');
    await atIntro(page);
    await page.clock.runFor(600);
    await expect(skip(page)).toBeVisible();
    await page.clock.runFor(5500);
    await expect(skip(page)).toBeHidden();
    await page.clock.runFor(30000);
    await expect(skip(page)).toBeHidden();
});
