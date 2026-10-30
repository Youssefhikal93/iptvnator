const { test, expect, boot, resumeSeed, movie, press, setting, choose } = require('./helpers');

// The "Logo and clock" screen saver (#74): the third choice of Settings >
// Display > Screen saver to use.
const saver = page => page.locator('#screen-saver');
const block = page => saver(page).locator('.ss-logo');

function seed(settings = {}, extra = {}) {
    const s = resumeSeed();
    s.screenSaver = true;
    s.storage['favorites:s1'] = { movies: [movie(7)] };
    s.storage.settings = { screenSaverKind: 'logo', ...settings };
    return { ...s, ...extra };
}

const idle = page => page.clock.fastForward(10 * 60 * 1000 + 1000);

test('Settings > Display > Screen saver to use offers Logo and clock and keeps it after a reload', async ({ page }) => {
    await boot(page, seed({ screenSaverKind: 'ours' }));
    await setting(page, 'Screen saver to use');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText("This app's");
    await choose(page, 'Logo and clock');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('Logo and clock');
    expect(await page.evaluate(() => Prefs.get('screenSaverKind'))).toBe('logo');
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-source', 'Regression TV');
    expect(await page.evaluate(() => Prefs.get('screenSaverKind'))).toBe('logo');
    await setting(page, 'Screen saver to use');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('Logo and clock');
});

test('after the idle time it shows the icon, a clock and the date, centred, with the hint; a key ends it and does nothing else', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-03-04T21:07:00') });
    await boot(page, seed());
    await page.clock.runFor(1000);
    await expect(saver(page)).toHaveCount(0);
    await idle(page);
    await expect(saver(page)).toBeVisible();
    // Not the slideshow: no titles, no artwork.
    await expect(saver(page).locator('.ss-title, .ss-art, .ss-poster')).toHaveCount(0);
    const icon = saver(page).locator('.ss-logo-icon');
    await expect(icon).toHaveAttribute('src', 'icon.png');
    await expect.poll(() => icon.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    expect((await icon.boundingBox()).width).toBe(150);
    await expect(saver(page).locator('.ss-logo-clock')).toHaveText(/^\d\d:\d\d$/);
    await expect(saver(page).locator('.ss-logo-date')).toHaveText(/Wednesday.*4.*March|Wednesday.*March.*4/);
    await expect(saver(page).locator('.ss-hint')).toHaveText('Press any key to go back');
    // Centred at first.
    const box = await block(page).boundingBox();
    expect(Math.abs(box.x + box.width / 2 - 960)).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - 540)).toBeLessThan(2);
    // The clock follows the time.
    const before = await saver(page).locator('.ss-logo-clock').innerText();
    await page.clock.fastForward(60 * 1000);
    await expect(saver(page).locator('.ss-logo-clock')).not.toHaveText(before);
    await press(page, 'Enter');
    await expect(saver(page)).toHaveCount(0);
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('#detail')).toBeHidden();
    await expect(page.locator('.hm-hero-buttons .focus')).toContainText('Continue watching');
});

test('every two minutes the block fades out and jumps to a new place that is fully on screen', async ({ page }) => {
    await page.clock.install();
    await boot(page, seed());
    await idle(page);
    await expect(block(page)).toBeVisible();
    const start = await block(page).boundingBox();
    // Not yet: a minute and a half in, it has not moved.
    await page.clock.fastForward(110 * 1000);
    await expect(block(page)).not.toHaveClass(/out/);
    expect(await block(page).boundingBox()).toEqual(start);
    await page.clock.fastForward(10 * 1000);
    // Fading out first, then at the new place and fading back in.
    await expect(block(page)).toHaveClass(/out/);
    await page.clock.runFor(800);
    await expect(block(page)).not.toHaveClass(/out/);
    await expect(block(page)).toHaveClass(/placed/);
    await expect(block(page)).toHaveCSS('opacity', '1');
    for (let i = 0; i < 4; i++) {
        const box = await block(page).boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(60 - 1);
        expect(box.y).toBeGreaterThanOrEqual(60 - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(1920 - 60 + 1);
        expect(box.y + box.height).toBeLessThanOrEqual(1080 - 60 + 1);
        await page.clock.fastForward(120 * 1000);
        await page.clock.runFor(800);
    }
    const last = await block(page).boundingBox();
    expect([last.x, last.y]).not.toEqual([start.x, start.y]);
});

test('with Animations Off the block jumps at once, with no fade', async ({ page }) => {
    await page.clock.install();
    await boot(page, seed({ motion: 'off' }));
    await idle(page);
    const start = await block(page).boundingBox();
    await page.clock.fastForward(120 * 1000);
    await expect(block(page)).not.toHaveClass(/out/);
    await expect(block(page)).toHaveClass(/placed/);
    await expect(block(page)).toHaveCSS('transition-duration', '0s');
    const moved = await block(page).boundingBox();
    expect([moved.x, moved.y]).not.toEqual([start.x, start.y]);
});

test('it needs no titles: it runs with no source at all', async ({ page }) => {
    await page.clock.install();
    await boot(page, { screenSaver: true, storage: { sources: [], settings: { screenSaverKind: 'logo' } } });
    await idle(page);
    await expect(saver(page)).toBeVisible();
    await expect(saver(page).locator('.ss-logo-icon')).toBeVisible();
    await expect(saver(page).locator('.ss-logo-clock')).toHaveText(/^\d\d:\d\d$/);
    await press(page, 'ArrowDown');
    await expect(saver(page)).toHaveCount(0);
});

test('it needs no titles: a fresh source with nothing watched or favorited still shows logo and clock', async ({ page }) => {
    await page.clock.install();
    await boot(page, { screenSaver: true, storage: { settings: { screenSaverKind: 'logo' } } });
    await idle(page);
    await expect(saver(page).locator('.ss-logo-icon')).toBeVisible();
    await expect(saver(page).locator('.ss-logo-date')).not.toHaveText('');
    await expect(saver(page).locator('.ss-clock')).toHaveCount(0);
});

test('an unknown saved kind falls back to the slideshow', async ({ page }) => {
    await page.clock.install();
    await boot(page, seed({ screenSaverKind: 'sparkles' }));
    await page.clock.runFor(1000);
    await idle(page);
    await expect(saver(page)).toBeVisible();
    await expect(saver(page).locator('.ss-logo')).toHaveCount(0);
    await expect(saver(page).locator('.ss-clock')).toBeVisible();
});
