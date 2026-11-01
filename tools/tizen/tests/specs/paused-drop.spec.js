const { test, expect, boot, openFirst, press, playing } = require('./helpers');

// A film paused for a long time: the provider drops the idle connection.
const drop = (page) => page.evaluate(() => document.getElementById('video').onerror());
const errorShown = (page) => page.locator('#pl-error-actions');

async function film(page) {
    await boot(page);
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await playing(page);
    // Past the first 5 s, so the pause saves where it was.
    await page.waitForTimeout(6500);
}

test('a film whose stream drops while paused stays paused and reopens where it was on Play', async ({ page }) => {
    const logs = [];
    page.on('console', (message) => logs.push(message.text()));
    await film(page);
    await press(page, 'Enter');
    await expect.poll(() => page.locator('#video').evaluate((v) => v.paused)).toBe(true);
    const at = await page.locator('#video').evaluate((v) => v.currentTime);
    await drop(page);
    await expect(errorShown(page)).toBeHidden();
    // The screen saver may start over it.
    expect(await page.evaluate(() => Player.paused())).toBe(true);
    await press(page, 'Enter');
    await playing(page);
    await expect(errorShown(page)).toBeHidden();
    expect(await page.locator('#video').evaluate((v) => v.currentTime)).toBeGreaterThanOrEqual(Math.floor(at) - 1);
    expect(logs.some((line) => /STREAM LOST .* while paused/.test(line))).toBe(true);
    expect(logs.some((line) => /REOPEN after pause/.test(line))).toBe(true);
});

test('a film whose stream drops while playing shows the error, which the screen saver may cover', async ({ page }) => {
    const logs = [];
    page.on('console', (message) => logs.push(message.text()));
    await film(page);
    await drop(page);
    await expect(errorShown(page)).toBeVisible();
    expect(await page.evaluate(() => Player.paused())).toBe(true);
    expect(logs.some((line) => /STREAM LOST /.test(line))).toBe(true);
});
