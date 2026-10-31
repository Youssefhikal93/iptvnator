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
    expect((await icon.boundingBox()).width).toBeCloseTo(300, -1);
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

const scene = page => block(page).evaluate(el => el.className + '|' + el.style.getPropertyValue('--size') + '|' + el.querySelector('.ss-logo-icon').className);

test('every two minutes the group leaves and returns as a new scene, a little off centre', async ({ page }) => {
    await page.clock.install();
    await boot(page, seed());
    await idle(page);
    await expect(block(page)).toBeVisible();
    const start = await block(page).boundingBox();
    const first = await scene(page);
    // Not yet: a minute and a half in, nothing changed.
    await page.clock.fastForward(110 * 1000);
    await expect(block(page)).not.toHaveClass(/out/);
    expect(await block(page).boundingBox()).toEqual(start);
    await page.clock.fastForward(10 * 1000);
    // Leaving first, with the variant's animation, then back.
    await expect(block(page)).toHaveClass(/out/);
    await page.clock.runFor(1300);
    await expect(block(page)).not.toHaveClass(/out/);
    await expect(block(page)).toHaveClass(/in/);
    expect(await scene(page)).not.toEqual(first);
    const seen = new Set([first]);
    for (let i = 0; i < 5; i++) {
        await page.clock.fastForward(120 * 1000);
        await page.clock.runFor(1300);
        await page.waitForTimeout(1400); // the CSS animation runs on real time
        const now = await scene(page);
        seen.add(now);
        const box = await block(page).boundingBox();
        // Within a twentieth of the screen of the middle, and fully on screen.
        expect(Math.abs(box.x + box.width / 2 - 960)).toBeLessThanOrEqual(96 + 2);
        expect(Math.abs(box.y + box.height / 2 - 540)).toBeLessThanOrEqual(54 + 2);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(1080);
    }
    // Sizes and motions differ from scene to scene.
    expect(seen.size).toBeGreaterThanOrEqual(5);
    const sizes = new Set([...seen].map(s => s.split('|')[1]));
    const plays = new Set([...seen].map(s => s.split('|')[2]));
    expect(sizes.size).toBeGreaterThan(2);
    expect(plays.size).toBeGreaterThan(2);
});

test('the first scene has the icon at twice its old size, a smaller clock, and a slow icon motion that leaves the clock still', async ({ page }) => {
    await page.clock.install();
    await boot(page, seed());
    await idle(page);
    const icon = saver(page).locator('.ss-logo-icon');
    expect((await icon.boundingBox()).width).toBeGreaterThan(280);
    await expect(icon).toHaveCSS('animation-name', 'ss-float');
    await expect(saver(page).locator('.ss-logo-clock')).toHaveCSS('animation-name', 'none');
    expect(parseFloat(await saver(page).locator('.ss-logo-clock').evaluate(el => getComputedStyle(el).fontSize))).toBeLessThan(200);
    expect(parseFloat(await saver(page).locator('.ss-logo-date').evaluate(el => getComputedStyle(el).fontSize))).toBeLessThan(38);
});

test('with Animations Off the next scene swaps at once, with no animation and no icon motion', async ({ page }) => {
    await page.clock.install();
    await boot(page, seed({ motion: 'off' }));
    await idle(page);
    const first = await scene(page);
    await expect(saver(page).locator('.ss-logo-icon')).toHaveCSS('animation-name', 'none');
    await page.clock.fastForward(120 * 1000);
    await expect(block(page)).not.toHaveClass(/out/);
    await expect(block(page)).toHaveCSS('transition-duration', '0s');
    await expect(block(page)).toHaveCSS('animation-name', 'none');
    await expect(saver(page).locator('.ss-logo-icon')).toHaveCSS('animation-name', 'none');
    expect(await scene(page)).not.toEqual(first);
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
