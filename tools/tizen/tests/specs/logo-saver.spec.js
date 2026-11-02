const { test, expect, boot, resumeSeed, movie, press, setting, choose } = require('./helpers');

// The "Logo and clock" screen saver (#74): the third choice of Settings >
// Display > Screen saver to use.
const saver = page => page.locator('#screen-saver');
const block = page => saver(page).locator('.ss-logo');
const extras = page => saver(page).locator('.ss-logo-extra');

async function centred(page) {
    const box = await block(page).boundingBox();
    expect(Math.abs(box.x + box.width / 2 - 960)).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - 540)).toBeLessThan(2);
    await expect(block(page)).toHaveCSS('opacity', '1');
    await expect(block(page)).toHaveCSS('animation-name', 'none');
    for (const selector of ['.ss-logo-clock', '.ss-logo-date']) {
        const text = saver(page).locator(selector);
        const bounds = await text.boundingBox();
        expect(Math.abs(bounds.x + bounds.width / 2 - 960)).toBeLessThan(2);
        await expect(text).toHaveCSS('animation-name', 'none');
    }
}

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
    await centred(page);
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

test('clock and date stay centred as extras grow 0, 2, 6, 14, 28 and reset to 2 every two minutes', async ({ page }) => {
    await page.clock.install();
    await boot(page, seed());
    await idle(page);
    await expect(block(page)).toBeVisible();
    await centred(page);
    await expect(extras(page)).toHaveCount(0);
    await page.clock.fastForward(110 * 1000);
    await expect(extras(page)).toHaveCount(0);
    await page.clock.fastForward(10 * 1000);
    await expect(extras(page)).toHaveCount(2);
    await centred(page);
    const first = extras(page).first().locator('img');
    await expect(first).toHaveCSS('animation-name', 'ss-rotate');
    await expect(extras(page).nth(1).locator('img')).toHaveCSS('animation-name', 'ss-flip');
    await expect(extras(page).first()).toHaveCSS('animation-name', 'ss-in');
    const original = await extras(page).first().elementHandle();
    for (const count of [6, 14, 28, 2]) {
        await page.clock.fastForward(120 * 1000);
        await expect(extras(page)).toHaveCount(count);
        await centred(page);
        await expect(saver(page).locator('.ss-logo-icon')).toHaveCSS('animation-name', 'ss-bounce');
        if (count === 28) expect(await original.evaluate(el => el.isConnected)).toBe(true);
        if (count === 2) expect(await original.evaluate(el => el.isConnected)).toBe(false);
    }
    // Dismiss a populated saver, then restart with no extras or stale step.
    await press(page, 'ArrowDown');
    await idle(page);
    await expect(extras(page)).toHaveCount(0);
    await page.clock.fastForward(120 * 1000);
    await expect(extras(page)).toHaveCount(2);
});

test('the main 300 px icon bounces forever above the still clock and date', async ({ page }) => {
    await page.clock.install();
    await boot(page, seed());
    await idle(page);
    const icon = saver(page).locator('.ss-logo-icon');
    expect((await icon.boundingBox()).width).toBeGreaterThan(280);
    await expect(icon).toHaveCSS('animation-name', 'ss-bounce');
    await expect(icon).toHaveCSS('animation-iteration-count', 'infinite');
    await expect(icon).toHaveCSS('animation-duration', '5.5s');
    await expect(icon).toHaveCSS('animation-timing-function', 'ease-in-out');
    await expect(saver(page).locator('.ss-logo-clock')).toHaveCSS('animation-name', 'none');
    expect(parseFloat(await saver(page).locator('.ss-logo-clock').evaluate(el => getComputedStyle(el).fontSize))).toBeLessThan(200);
    expect(parseFloat(await saver(page).locator('.ss-logo-date').evaluate(el => getComputedStyle(el).fontSize))).toBeLessThan(38);
});

test('with Animations Off nothing animates, but extras still accumulate and reset every two minutes', async ({ page }) => {
    await page.clock.install();
    await boot(page, seed({ motion: 'off' }));
    await idle(page);
    for (const count of [0, 2, 6, 14, 28, 2]) {
        if (count) await page.clock.fastForward(120 * 1000);
        await expect(extras(page)).toHaveCount(count);
        await centred(page);
        expect(await saver(page).locator('*').evaluateAll(els => els.every(el => getComputedStyle(el).animationName === 'none'))).toBe(true);
        if (count) await expect(extras(page).last()).toHaveCSS('opacity', '1');
    }
});

test('the full swarm has staggered loops, distinct neighbours and no animated overlaps', async ({ page }) => {
    await page.clock.install();
    await boot(page, seed());
    await idle(page);
    for (let step = 0; step < 4; step++) await page.clock.fastForward(120 * 1000);
    await expect(extras(page)).toHaveCount(28);
    const loops = await extras(page).evaluateAll(els => els.map(el => {
        const style = getComputedStyle(el.querySelector('img'));
        return { x: parseFloat(el.style.left), y: parseFloat(el.style.top), name: style.animationName, duration: style.animationDuration, delay: style.animationDelay, iterations: style.animationIterationCount };
    }));
    expect(new Set(loops.map(loop => loop.duration)).size).toBe(28);
    expect(new Set(loops.map(loop => loop.delay)).size).toBe(28);
    expect(new Set(loops.map(loop => loop.name)).size).toBeGreaterThanOrEqual(9);
    loops.forEach((loop, i) => {
        expect(loop.iterations).toBe('infinite');
        expect(parseFloat(loop.duration)).toBeGreaterThanOrEqual(14);
        expect(parseFloat(loop.duration)).toBeLessThanOrEqual(20);
        loops.slice(0, i).forEach(other => {
            if (Math.abs(loop.x - other.x) <= 12.51 && Math.abs(loop.y - other.y) <= 16.67) expect(loop.name).not.toBe(other.name);
        });
    });
    // CSS runs on real time: sample its transforms directly, including rotated
    // corners and 3D flips, rather than relying on fastForward to animate it.
    const violations = await saver(page).evaluate(stage => {
        const images = Array.from(stage.querySelectorAll('.ss-logo-extra-icon'));
        const failures = [];
        for (let sample = 0; sample < 16; sample++) {
            images.forEach(img => img.getAnimations().forEach(animation => {
                animation.pause();
                animation.currentTime = sample / 16 * animation.effect.getTiming().duration;
            }));
            const centre = stage.querySelector('.ss-logo').getBoundingClientRect();
            const boxes = images.map(img => img.getBoundingClientRect());
            const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            boxes.forEach((box, i) => {
                if (box.left < 0 || box.right > 1920 || box.top < 0 || box.bottom > 1080) failures.push('offscreen ' + i);
                if (overlaps(box, centre)) failures.push('centre ' + i);
                boxes.slice(0, i).forEach(other => { if (overlaps(box, other)) failures.push('overlap ' + i); });
            });
        }
        return failures;
    });
    expect(violations).toEqual([]);
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
