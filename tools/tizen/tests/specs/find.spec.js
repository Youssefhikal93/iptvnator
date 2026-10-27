const { test, expect, boot, section, press } = require('./helpers');

// Search everything (#31): one box over Live TV, Movies and Series.
test('Search finds channels, movies and series in rows and opens a result', async ({ page }) => {
    await boot(page);
    await section(page, 'Search');
    await expect(page.locator('.fd-box')).toHaveClass(/focused/);
    await expect(page.locator('.fd-status')).toHaveText('Type a channel, movie or series name.');
    await press(page, 'Enter');
    await expect(page.locator('.fd-box')).toHaveClass(/typing/);
    await page.keyboard.type('1');
    await press(page, 'Enter');
    const rows = page.locator('#find .hm-row');
    await expect(rows.locator('h2')).toHaveText(['Live TV', 'Movies', 'Series']);
    // Titles that start with the query come first.
    await expect(rows.nth(1).locator('.hm-card > span').first()).toHaveText('Movie 1');
    await expect(rows.first().locator('.hm-card.focus')).toHaveCount(1);
    await press(page, 'ArrowDown');
    // The focused row moves to the top, as on Home.
    await expect(page.locator('#find .hm-card.focus > span')).toHaveText('Movie 1');
    await press(page, 'Enter');
    await expect(page.locator('#detail')).toContainText('Movie 1');
});

test('genre pills list a genre on their own and narrow a search; Arabic and English names are one genre', async ({ page }) => {
    await boot(page);
    await section(page, 'Search');
    const pills = page.locator('.fd-pills .tm-chip');
    await expect(pills.first()).toHaveText('All');
    await expect(pills.filter({ hasText: /^Drama$/ })).toHaveCount(1);
    await expect(pills.filter({ hasText: 'دراما' })).toHaveCount(0);
    await press(page, 'ArrowDown');
    await expect(pills.first()).toHaveClass(/focus/);
    // Drama is the most common genre, so it comes right after All.
    await expect(pills.nth(1)).toHaveText('Drama');
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(pills.nth(1)).toHaveClass(/selected/);
    const rows = page.locator('#find .hm-row');
    await expect(rows.locator('h2')).toHaveText(['Series']);
    await expect(rows.locator('.hm-aside')).toHaveText('10');
    // With a query too, only Drama shows that match it.
    await press(page, 'ArrowUp');
    await press(page, 'Enter');
    await page.keyboard.type('Show 1');
    await press(page, 'Enter');
    await expect(rows.locator('.hm-card > span')).toHaveText(['Show 1', 'Show 10', 'Show 12', 'Show 13', 'Show 15']);
});

test('genres TMDB has matched join the provider genres for movies and series', async ({ page }) => {
    await boot(page);
    // TMDB matched Movie 2 as a Thriller and Show 2 (a provider Comedy) as a Thriller too.
    await page.evaluate(() => {
        Tmdb.enabled = () => true;
        Tmdb.cached = (item) => (item.name === 'Movie 2' || item.name === 'Show 2' ? { genres: [{ id: 53, name: 'Thriller' }] } : null);
    });
    await section(page, 'Search');
    const pills = page.locator('.fd-pills .tm-chip');
    await expect(pills.filter({ hasText: /^Thriller$/ })).toHaveCount(1);
    await press(page, 'ArrowDown');
    const at = (await pills.allTextContents()).indexOf('Thriller');
    for (let i = 0; i < at; i++) await press(page, 'ArrowRight');
    await press(page, 'Enter');
    const rows = page.locator('#find .hm-row');
    await expect(rows.locator('h2')).toHaveText(['Movies', 'Series']);
    await expect(rows.locator('.hm-card > span')).toHaveText(['Movie 2', 'Show 2']);
});
