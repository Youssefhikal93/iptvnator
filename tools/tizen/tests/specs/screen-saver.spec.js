const { test, expect, boot, resumeSeed, movie, press, setting, choose, playing, section } = require('./helpers');

const saver = page => page.locator('#screen-saver');

function seed(settings = {}) {
    const s = resumeSeed();
    s.screenSaver = true;
    s.storage['favorites:s1'] = { movies: [movie(7)] };
    s.storage.settings = settings;
    return s;
}

test('after ten idle minutes on Home the slideshow shows the titles; the waking key does nothing else', async ({ page }) => {
    await page.clock.install();
    await boot(page, seed());
    await expect(page.locator('.hm-hero-title')).toHaveText('Movie 25');
    // The hero has asked for its details: the backdrop is now known.
    await page.clock.runFor(1000);
    await page.clock.fastForward(9 * 60 * 1000);
    await expect(saver(page)).toHaveCount(0);
    await page.clock.fastForward(61 * 1000);
    await expect(saver(page)).toBeVisible();
    await expect(saver(page).locator('.ss-from')).toHaveText('Continue watching');
    await expect(saver(page).locator('.ss-title')).toHaveText('Movie 25');
    await expect(saver(page).locator('.ss-meta')).toContainText('min left');
    await expect(saver(page).locator('.ss-art')).toHaveAttribute('src', /backdrop\.jpg/);
    await expect(saver(page).locator('.ss-hint')).toHaveText('Press any key to go back');
    // Twenty seconds later the next title, and not one request on the way.
    const requests = [];
    page.on('request', req => { if (!req.url().includes('/img/')) requests.push(req.url()); });
    await page.clock.fastForward(20 * 1000);
    // The favorite has no artwork in its saved snapshot, so Recently added is next.
    await expect(saver(page).locator('.ss-from')).toHaveText('Recently added movies');
    await expect(saver(page).locator('.ss-title')).not.toHaveText('Movie 25');
    await page.clock.fastForward(20 * 1000);
    await expect(saver(page).locator('.ss-from')).toHaveText('Recently added movies');
    expect(requests).toEqual([]);
    await press(page, 'Enter');
    await expect(saver(page)).toHaveCount(0);
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('#detail')).toBeHidden();
    await expect(page.locator('.hm-hero-buttons .focus')).toContainText('Continue watching');
});

test('a key press while idle costs no storage read and no request', async ({ page }) => {
    await page.clock.install();
    await boot(page, seed());
    await section(page, 'Movies');
    const measure = () => page.evaluate(() => {
        let reads = 0;
        const original = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key) { reads++; return original.call(this, key); };
        try {
            const event = new KeyboardEvent('keydown', { keyCode: 0, which: 0, bubbles: true });
            for (let i = 0; i < 20; i++) window.dispatchEvent(event);
        } finally { Storage.prototype.getItem = original; }
        return reads;
    });
    expect(await measure()).toBe(0);
});

test('playing full screen never starts it; a paused video does, and stays paused after', async ({ page }) => {
    await page.clock.install();
    await boot(page, seed());
    await press(page, 'Enter');
    await playing(page);
    await page.clock.fastForward(15 * 60 * 1000);
    await expect(saver(page)).toHaveCount(0);
    await page.locator('#video').evaluate(v => v.pause());
    await page.clock.fastForward(11 * 60 * 1000);
    await expect(saver(page)).toBeVisible();
    await press(page, 'ArrowLeft');
    await expect(saver(page)).toHaveCount(0);
    await expect(page.locator('#player')).toBeVisible();
    expect(await page.locator('#video').evaluate(v => v.paused)).toBe(true);
});

test('Settings > Display > Screen saver: Off never starts it, 5 min starts sooner; Animations off stops the drift', async ({ page }) => {
    await page.clock.install();
    await boot(page, seed({ motion: 'off' }));
    await setting(page, 'Screen saver');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('10 min');
    await choose(page, 'Off');
    await page.clock.fastForward(30 * 60 * 1000);
    await expect(saver(page)).toHaveCount(0);
    await choose(page, '5 min');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('5 min');
    await page.clock.fastForward(5 * 60 * 1000 + 1000);
    await expect(saver(page)).toBeVisible();
    const art = saver(page).locator('.ss-art, .ss-poster').first();
    await expect(art).toHaveCSS('animation-name', 'none');
    await press(page, 'Enter');
    await expect(saver(page)).toHaveCount(0);
    // The waking OK did not open the choices.
    await expect(page.locator('#menu')).toBeHidden();
});

test("Screen saver to use: the TV's own never starts ours and hands idle to Samsung's; This app's brings ours back", async ({ page }) => {
    await page.clock.install();
    await page.addInitScript(() => {
        window.__samsung = [];
        window.webapis = Object.assign(window.webapis || {}, { appcommon: {
            AppCommonScreenSaverState: { SCREEN_SAVER_OFF: 0, SCREEN_SAVER_ON: 1 },
            setScreenSaver: (state) => window.__samsung.push(state),
        } });
    });
    await boot(page, seed({ screenSaverKind: 'tv' }));
    await page.clock.fastForward(30 * 60 * 1000);
    await expect(saver(page)).toHaveCount(0);
    // Samsung's screen saver is on.
    expect(await page.evaluate(() => window.__samsung.slice(-1)[0])).toBe(1);
    await setting(page, 'Screen saver to use');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText("The TV's own");
    await choose(page, "This app's");
    expect(await page.evaluate(() => window.__samsung.slice(-1)[0])).toBe(0);
    await page.clock.fastForward(10 * 60 * 1000 + 1000);
    await expect(saver(page)).toBeVisible();
});