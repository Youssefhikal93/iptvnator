const { test, expect, boot, section, category, enterItems, toolbar, press } = require('./helpers');

test('Live TV, Movies and Series load provider categories and items', async ({ page }) => {
    await boot(page);
    for (const [name, count, first] of [['Live TV', 500, 'Channel 1'], ['Movies', 25, 'Movie 25'], ['Series', 15, 'Show 4']]) {
        await section(page, name);
        await expect(page.locator('#items .count')).toHaveText('1 / ' + count);
        await expect(page.locator('#items')).toContainText(first);
    }
    await section(page, 'Live TV');
    await category(page, 'get_live_categories cat 1');
    await expect(page.locator('#items .count')).toHaveText('1 / 40');
    await expect(page.locator('#items')).toContainText('Channel 1 (cat 1)');
    await category(page, 'get_live_categories cat 30');
    await expect(page.locator('#items')).toContainText('Channel 1 (cat 30)');
});

test('saved catalogue is usable after reload while provider responses are held', async ({ page }) => {
    await boot(page);
    await section(page, 'Movies');
    await expect(page.locator('#items')).toContainText('Movie 25');
    // A readonly transaction queues behind the app's cache writes. Read the
    // actual database, without calling the app's catalogue implementation.
    await expect.poll(() => page.evaluate(() => new Promise(resolve => {
        const request = indexedDB.open('iptvnator-tv', 1);
        request.onsuccess = () => {
            const db = request.result;
            const read = db.transaction('catalogue').objectStore('catalogue').get('s1|movies:items:1');
            read.onsuccess = () => { resolve(read.result?.length || 0); db.close(); };
        };
    }))).toBe(25);
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let pending = 0;
    await page.route('**/player_api.php?**', async route => {
        pending++;
        await held;
        await route.continue().catch(() => {});
    });
    try {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await section(page, 'Movies');
        await expect(page.locator('#items')).toContainText('Movie 25');
        await expect(page.locator('#items .count')).toHaveText('1 / 25');
        expect(pending).toBeGreaterThan(0);
        await expect(page.locator('#load-error')).toBeHidden();
    } finally { release(); }
});

test('search filters titles and list/grid choice survives reload', async ({ page }) => {
    await boot(page);
    await section(page, 'Movies');
    await enterItems(page);
    await toolbar(page, 'list');
    await press(page, 'Enter');
    await press(page, 'ArrowDown');
    await expect(page.locator('#items .row.focused')).toBeVisible();
    await toolbar(page, 'search');
    await press(page, 'Enter');
    await page.locator('#search-input').fill('Movie 17');
    await press(page, 'Enter');
    await expect(page.locator('#items .count')).toHaveText('1 / 1');
    await expect(page.locator('#items .focused .label')).toHaveText('Movie 17');
    await toolbar(page, 'search');
    await press(page, 'Enter');
    await page.locator('#search-input').fill('No such movie');
    await expect(page.locator('#items .list-empty')).toContainText('No results');
    await page.reload();
    await section(page, 'Movies');
    await expect(page.locator('#items .row').first()).toBeVisible();
    await expect(page.locator('#items .card')).toHaveCount(0);
});

test('▼ from the search bar lands on the results even when the search started from the categories', async ({ page }) => {
    await boot(page);
    await section(page, 'Series');
    // The focus is on the category list; ▲ past the top category reaches the search bar.
    await expect(page.locator('#categories .focused')).toBeVisible();
    for (let i = 0; i < 8 && !(await page.locator('#searchbar.focused').count()); i++) await press(page, 'ArrowUp');
    await expect(page.locator('#searchbar')).toHaveClass(/focused/);
    await press(page, 'Enter');
    await page.locator('#search-input').fill('Show 7');
    await expect(page.locator('#items .list-header')).toContainText('Show 7');
    // Return stops typing and leaves the focus on the search bar with the results showing.
    await press(page, 'Escape');
    await expect(page.locator('#searchbar')).toHaveClass(/focused/);
    await press(page, 'ArrowDown');
    await expect(page.locator('#items .focused')).toContainText('Show 7');
    await expect(page.locator('#categories .focused')).toHaveCount(0);
    // With no results, ▼ goes back to the categories.
    await press(page, 'ArrowUp');
    await press(page, 'Enter');
    await page.locator('#search-input').fill('No such show');
    await expect(page.locator('#items .list-empty')).toContainText('No results');
    await press(page, 'Escape');
    await press(page, 'ArrowDown');
    await expect(page.locator('#categories .focused')).toBeVisible();
});
