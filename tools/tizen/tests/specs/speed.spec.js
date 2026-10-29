const { test, expect, boot, movie, show, channel, press } = require('./helpers');

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
