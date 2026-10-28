const { test, expect, boot, openFirst, press, playing, teachIntro } = require('./helpers');

const skip = page => page.locator('#pl-skip');
// The show's learnt intro { from, to } in ms (0 when none).
const learnt = page => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem(ProfileStore.key('intros')) || '{}'))[0] || 0);

// The episode on screen at `at` seconds; paused unless asked.
async function seekTo(page, at, keepPlaying) {
    await page.locator('#video').evaluate((v, [t, play]) => { if (!play) v.pause(); v.currentTime = t; }, [at, !!keepPlaying]);
}

// The first episode of the first show, with the page clock held.
async function startEpisode(page, keepPlaying) {
    await page.clock.install();
    await boot(page);
    await openFirst(page, 'Series');
    await press(page, 'Enter');
    await playing(page);
    await seekTo(page, 15, keepPlaying);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
}

// Taught 0:15 -> 0:35 by hand, then back at 0:12, 3 s into the window that
// opens 5 s before the intro.
async function taughtAndBack(page, keepPlaying) {
    await teachIntro(page, 15, { clock: true });
    const mark = await learnt(page);
    // A playing video moves on a little before the jump starts.
    expect(mark.from).toBeGreaterThanOrEqual(15000);
    expect(mark.from).toBeLessThan(keepPlaying ? 17000 : 15001);
    expect(mark.to - mark.from).toBe(20000);
    await seekTo(page, 12, keepPlaying);
}

test('no Skip intro until an intro has been skipped by hand', async ({ page }) => {
    await startEpisode(page);
    await page.clock.runFor(3000);
    await expect(skip(page)).toBeHidden();
    // ▲ ▲ reaches the timeline and then the menu, never a Skip intro.
    await press(page, 'ArrowUp');
    await press(page, 'ArrowUp');
    await expect(page.locator('#pl-menu')).toBeVisible();
    await expect(skip(page)).toBeHidden();
    expect(await learnt(page)).toBe(0);
});

test('once taught, Skip intro shows from 5 s before the intro for 7 seconds, then hides', async ({ page }) => {
    await startEpisode(page);
    await taughtAndBack(page);
    await page.clock.runFor(600);
    await expect(skip(page)).toBeVisible();
    await page.clock.runFor(5500);
    await expect(skip(page)).toBeVisible();
    await page.clock.runFor(1500);
    await expect(skip(page)).toBeHidden();
    // Before the window (0:05 is earlier than 0:15 - 5 s) it never shows.
    await seekTo(page, 5);
    await page.clock.runFor(600);
    await expect(skip(page)).toBeHidden();
});

test('a short jump, a jump after 5 minutes and a rewind teach nothing', async ({ page }) => {
    await startEpisode(page);
    // +10 s only.
    await press(page, 'ArrowUp');
    await press(page, 'ArrowRight');
    await page.clock.runFor(600);
    expect(await learnt(page)).toBe(0);
    // +20 s, but starting at 5:10.
    await seekTo(page, 310);
    await page.clock.runFor(5000);
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    await page.clock.runFor(600);
    expect(await learnt(page)).toBe(0);
    // -20 s.
    await seekTo(page, 90);
    await page.clock.runFor(5000);
    await press(page, 'ArrowLeft');
    await press(page, 'ArrowLeft');
    await page.clock.runFor(600);
    expect(await learnt(page)).toBe(0);
});

test('quick +10 jumps in a row count as one skip, and the latest skip wins', async ({ page }) => {
    await startEpisode(page);
    await press(page, 'ArrowUp');
    // Two separate +10 s jumps, a second apart: 0:15 -> 0:35 together.
    await press(page, 'ArrowRight');
    await page.clock.runFor(1000);
    await press(page, 'ArrowRight');
    await page.clock.runFor(1000);
    expect(await learnt(page)).toEqual({ from: 15000, to: 35000 });
    // A later skip by hand, 0:20 -> 0:50, replaces it.
    await page.clock.runFor(6000);
    await seekTo(page, 20);
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    await page.clock.runFor(600);
    expect(await learnt(page)).toEqual({ from: 20000, to: 50000 });
});

test('bringing the controls up during the intro shows Skip intro for another 7 seconds', async ({ page }) => {
    // Playing: the controls only hide on their own while the video plays.
    await startEpisode(page, true);
    await taughtAndBack(page, true);
    await page.clock.runFor(8000);
    await expect(skip(page)).toBeHidden();
    await page.clock.runFor(8000);
    await expect(page.locator('#pl-controls')).toBeHidden();
    // Still inside 0:10–0:35 (the video plays in real time).
    await seekTo(page, 20, true);
    await press(page, 'ArrowDown');
    await expect(page.locator('#pl-controls')).toBeVisible();
    await page.clock.runFor(600);
    await expect(skip(page)).toBeVisible();
    await page.clock.runFor(7000);
    await expect(skip(page)).toBeHidden();
});

test('a focused Skip intro stays until it is used or left, and OK jumps to the learnt end', async ({ page }) => {
    await startEpisode(page);
    await taughtAndBack(page);
    await page.clock.runFor(600);
    await press(page, 'ArrowUp');
    await expect(skip(page)).toHaveClass(/focus/);
    await page.clock.runFor(10000);
    await expect(skip(page)).toBeVisible();
    await press(page, 'Enter');
    await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(34);
    await page.clock.runFor(600);
    await expect(skip(page)).toBeHidden();
});
