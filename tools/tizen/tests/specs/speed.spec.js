const { test, expect, boot, movie, show, channel, press, section, enterItems, sendKeyCode, playing } = require('./helpers');

// A library the size a viewer builds up: 40 titles in progress, 30
// favorites per section and 300 watched episodes.
function library() {
    const progress = {};
    const recent = [];
    for (let n = 1; n <= 40; n++) {
        recent.push(movie(n));
        progress['movie:' + (2000 + n)] = { position: 100 + n, duration: 4000, updatedAt: 1000 + n };
    }
    for (let n = 1; n <= 300; n++) progress['episode:' + (90000 + n)] = { position: 3000, duration: 3000, updatedAt: n };
    const favorites = { movies: [], series: [], live: [] };
    for (let n = 41; n <= 70; n++) favorites.movies.push(movie(n));
    for (let n = 1; n <= 30; n++) favorites.series.push(show(n));
    for (let n = 1; n <= 30; n++) favorites.live.push(channel(n));
    return { storage: { progress, 'recent:s1': { movies: recent }, 'favorites:s1': favorites } };
}

// Storage reads made by the app while it handles `keys`.
async function readsFor(page, keys) {
    return page.evaluate(async (keys) => {
        const get = Storage.prototype.getItem;
        let reads = 0;
        Storage.prototype.getItem = function (key) {
            reads++;
            return get.call(this, key);
        };
        try {
            for (const code of keys) {
                document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: code, which: code, bubbles: true }));
                document.dispatchEvent(new KeyboardEvent('keyup', { keyCode: code, which: code, bubbles: true }));
                await new Promise((done) => setTimeout(done, 50));
            }
        } finally {
            Storage.prototype.getItem = get;
        }
        return reads;
    }, keys);
}

test('a Home move reads each saved record once, not once per tile (#53)', async ({ page }) => {
    await boot(page, library());
    await expect(page.locator('.hm-hero-title')).toBeVisible();
    await press(page, 'ArrowDown');
    await expect(page.locator('.hm-row .hm-card.focus')).toBeVisible();
    // Each press drew Home from about 2000 reads of the same few records.
    const reads = await readsFor(page, [39, 39, 39, 37, 37, 37]);
    expect(reads / 6).toBeLessThan(25);
    await expect(page.locator('.hm-row .hm-card.focus')).toBeVisible();
});

test('the menu opens a section once its focus rests there, or at once with ▶ (#53)', async ({ page }) => {
    await boot(page);
    await expect(page.locator('#content.home')).toHaveCount(1);
    await press(page, 'ArrowLeft');
    await expect(page.locator('#rail .focused')).toHaveText('Home');
    // Passing Live TV on the way to Movies opens neither while moving.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#rail .focused')).toHaveText('Movies');
    await expect(page.locator('#content.home')).toHaveCount(1);
    // Resting on Movies opens it.
    await expect(page.locator('#content.home')).toHaveCount(0);
    await expect(page.locator('#categories .row').first()).toBeVisible();
    // ▶ opens the focused section without waiting.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#rail .focused')).toHaveCount(0);
    await expect(page.locator('#rail .active')).toHaveText('Series');
    await expect(page.locator('#categories .row.focused')).toHaveCount(1);
});

test('#90 a grid move keeps the posters already on screen instead of loading them again', async ({ page }) => {
    await boot(page);
    await section(page, 'Movies');
    await enterItems(page);
    const posters = page.locator('#items .card:not(.peek) img.icon');
    await expect(posters.first()).toBeVisible();
    await expect.poll(() => posters.evaluateAll((imgs) => imgs.length > 0 && imgs.every((img) => img.complete && img.naturalWidth > 0))).toBe(true);
    await page.evaluate(() => { window.__shown = new Set(document.querySelectorAll('#items img.icon')); });
    // The second ▼ scrolls the grid by a row: the two rows still shown keep their pictures.
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await expect(page.locator('#items .count')).toHaveText(/^13 \//);
    const kept = await page.evaluate(() => [...document.querySelectorAll('#items .card:not(.peek) img.icon')].filter((img) => window.__shown.has(img)).length);
    expect(kept).toBeGreaterThanOrEqual(12);
});
test('#90 a Live TV move keeps the channel plates already on screen', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await enterItems(page);
    const plates = page.locator('#items .row .row-plate');
    await expect(plates.first()).toBeVisible();
    const shown = await plates.count();
    await page.evaluate(() => { window.__plates = new Set(document.querySelectorAll('#items .row-plate')); });
    // Far enough down that the list scrolls: every plate but the one coming in is kept.
    for (let i = 0; i < shown; i++) await press(page, 'ArrowDown');
    await expect(page.locator('#items .count')).toHaveText(new RegExp('^' + (shown + 1) + ' /'));
    await page.evaluate(() => { window.__plates = new Set(document.querySelectorAll('#items .row-plate')); });
    await press(page, 'ArrowDown');
    const kept = await page.evaluate(() => [...document.querySelectorAll('#items .row-plate')].filter((node) => window.__plates.has(node)).length);
    expect(kept).toBeGreaterThanOrEqual(shown - 1);
    await expect(page.locator('#items .row.focused .label')).toBeVisible();
});
test('#90 a guide move redraws only the rows it changes, and every row once a programme starts or ends', async ({ page }) => {
    await page.clock.install();
    await boot(page);
    await section(page, 'Live TV');
    await enterItems(page);
    await sendKeyCode(page, 458);
    await expect(page.locator('#guide .gd-programme.focused')).toContainText('Program');
    await expect(page.locator('#guide .gd-loading')).toHaveCount(0);
    const mark = () => page.evaluate(() => { window.__rows = new Set(document.querySelectorAll('#guide .gd-row')); });
    const kept = () => page.evaluate(() => [...document.querySelectorAll('#guide .gd-row')].filter((row) => window.__rows.has(row)).length);
    await mark();
    await press(page, 'ArrowRight');
    expect(await kept()).toBe(8);
    await mark();
    await press(page, 'ArrowDown');
    await expect(page.locator('#guide .gd-row.selected')).toHaveAttribute('data-index', '1');
    expect(await kept()).toBe(7);
    // An hour later what is airing has changed: the next move draws every row again.
    await mark();
    await page.clock.fastForward('01:00:00');
    await press(page, 'ArrowLeft');
    expect(await kept()).toBe(0);
    await expect(page.locator('#guide .gd-row')).toHaveCount(9);
});
test('#90 a move in the channel list over the video keeps the plates already shown', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await press(page, 'ArrowLeft');
    await expect(page.locator('.pl-channel.focused .pl-channel-name')).toHaveText('Channel 1 (cat 2)');
    const shown = await page.locator('.pl-channel-logo').count();
    await page.evaluate(() => { window.__plates = new Set(document.querySelectorAll('.pl-channel-logo')); });
    await press(page, 'ArrowDown');
    await expect(page.locator('.pl-channel.focused .pl-channel-name')).toHaveText('Channel 2 (cat 2)');
    const kept = await page.evaluate(() => [...document.querySelectorAll('.pl-channel-logo')].filter((node) => window.__plates.has(node)).length);
    expect(kept).toBe(shown);
});
test('#103 the key timing log names Home presses made on the hero apart from the rows', async ({ page }) => {
    const lines = [];
    page.on('console', (message) => { if (/^INFO KEYS home/.test(message.text())) lines.push(message.text().replace(/^INFO /, '')); });
    await boot(page, library());
    await expect(page.locator('.hm-hero .dt-btn.focus')).toBeVisible();
    // ▶ ◀ along the hero's buttons, 10 presses, never leaving it.
    for (let i = 0; i < 5; i++) {
        await press(page, 'ArrowRight');
        await press(page, 'ArrowLeft');
    }
    await expect.poll(() => lines.length).toBe(1);
    expect(lines[0]).toMatch(/^KEYS home cinema hero 10, median [\d.]+ ms, max [\d.]+ ms$/);
});

// A 3840×2160 picture for every backdrop the fake server links.
async function fourKBackdrops(page) {
    await page.route('**/img/backdrop.jpg*', async (route) => {
        const browser = route.request().frame().page();
        const base64 = await browser.evaluate(() => {
            const c = document.createElement('canvas');
            c.width = 3840;
            c.height = 2160;
            const g = c.getContext('2d');
            g.fillStyle = '#346';
            g.fillRect(0, 0, 3840, 2160);
            return c.toDataURL('image/jpeg', 0.5).split(',')[1];
        });
        await route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from(base64, 'base64') });
    });
}

test('#103 Backdrop mode draws a 4K backdrop 1280 wide; Cinema keeps its picture as before', async ({ page }) => {
    await fourKBackdrops(page);
    const seed = library();
    seed.storage.settings = { homeLayout: 'backdrop' };
    await boot(page, seed);
    // The title's details bring its backdrop; it shows shrunk, faded in, across the screen.
    const canvas = page.locator('.hm-stage-art.big-art.art-in > canvas');
    await expect(canvas).toBeVisible();
    expect(await canvas.evaluate((c) => [c.width, c.height])).toEqual([1280, 720]);
    expect((await page.locator('.hm-stage-art').boundingBox()).width).toBe(1920 - (await page.locator('#rail').boundingBox()).width);
    await expect(page.locator('.hm-card canvas')).toHaveCount(0);
    // Cinema's hero is the plain picture, untouched.
    await page.evaluate(() => Prefs.set('homeLayout', 'cinema'));
    await expect(page.locator('img.hm-hero-art[src*="backdrop.jpg"]')).toBeVisible();
    await expect(page.locator('#home canvas')).toHaveCount(0);
});