const { test, expect, boot, resumeSeed, openFirst, press, playing, savedProgress } = require('./helpers');

test('Resume from movie detail restores 200 seconds and continues saving progress', async ({ page }) => {
    await boot(page, resumeSeed());
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await playing(page);
    await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(195);
    expect(await page.locator('#video').evaluate(v => v.currentTime)).toBeLessThan(215);
    await expect.poll(async () => (await savedProgress(page, 'movie:2025')).position, { timeout: 20_000 }).toBeGreaterThan(200);
    await expect(page.locator('#pl-resume')).toBeHidden();
});

test('ignored resume seeks preserve saved position through the 30-second deadline; Retry restores it', async ({ page }) => {
    await boot(page, resumeSeed());
    // Simulate a media engine silently rejecting seeks, at the browser API boundary.
    await page.evaluate(() => {
        window.originalTime = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
        Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { ...window.originalTime, set() {} });
    });
    await openFirst(page, 'Movies');
    const started = Date.now();
    await press(page, 'Enter');
    await playing(page);
    await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeGreaterThan(6);
    expect((await savedProgress(page, 'movie:2025')).position).toBe(200);
    await expect(page.locator('#pl-resume')).toBeVisible({ timeout: 40_000 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(29_000);
    await expect(page.locator('#pl-resume-title')).toHaveText('Could not restore saved progress.');
    await expect(page.locator('#pl-resume-yes')).toHaveText('Retry');
    await expect(page.locator('#pl-resume-no')).toHaveText('Start over');
    expect((await savedProgress(page, 'movie:2025')).position).toBe(200);
    await page.evaluate(() => Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', window.originalTime));
    await press(page, 'Enter');
    await expect(page.locator('#pl-resume')).toBeHidden();
    await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(195);
    expect(await page.locator('#video').evaluate(v => v.currentTime)).toBeLessThan(215);
    await expect.poll(async () => (await savedProgress(page, 'movie:2025')).position, { timeout: 20_000 }).toBeGreaterThan(200);
});
