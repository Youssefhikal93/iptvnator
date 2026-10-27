const { test, expect, boot, section, press, moveTo, enterItems } = require('./helpers');

// Search everything (#31): the icon at the top right of Home opens a bar;
// the results take the place of the rows, movies first.
test('Home search shows movies, series and Live TV results and Return closes it', async ({ page }) => {
    await boot(page);
    await expect(page.locator('.hm-search-icon')).toBeVisible();
    await press(page, 'ArrowUp');
    await expect(page.locator('.hm-search-icon')).toHaveClass(/focus/);
    await expect(page.locator('#hints')).toContainText('OK: search');
    await press(page, 'Enter');
    await expect(page.locator('.hm-search-bar')).toHaveClass(/typing/);
    await expect(page.locator('.hm-search-note')).toHaveText('Type a movie, series or channel name.');
    await page.keyboard.type('1');
    await press(page, 'Enter');
    const rows = page.locator('#home .hm-row');
    await expect(rows.locator('h2')).toHaveText(['Movies', 'Series', 'Live TV']);
    // Titles that start with the query come first; the focus is on them.
    await expect(page.locator('#home .hm-card.focus > span')).toHaveText('Movie 1');
    await press(page, 'Enter');
    await expect(page.locator('#detail')).toContainText('Movie 1');
    await press(page, 'Escape');
    await expect(page.locator('.hm-search-bar')).toBeVisible();
    await press(page, 'Escape');
    await expect(page.locator('.hm-search')).toHaveCount(0);
    await expect(page.locator('.hm-search-icon')).toBeVisible();
});

test('genre pills under the Series search bar narrow the list; Arabic and English names are one genre', async ({ page }) => {
    await boot(page);
    await section(page, 'Series');
    // Recently added holds every show.
    await moveTo(page, '#categories .row.focused .label', 'Recently added', 'ArrowUp');
    await enterItems(page);
    const pills = page.locator('#genre-pills .tm-chip');
    await expect(pills.first()).toHaveText('All');
    // Drama is the most common genre, so it comes right after All.
    await expect(pills.nth(1)).toHaveText('Drama');
    await expect(pills.filter({ hasText: 'دراما' })).toHaveCount(0);
    await press(page, 'ArrowUp');
    await expect(pills.first()).toHaveClass(/focus/);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(pills.nth(1)).toHaveClass(/selected/);
    // Show 2 is a Comedy; Show 1 is Drama in Arabic.
    const names = await page.locator('#items .card .card-title, #items .row .label').allTextContents();
    expect(names.length).toBe(10);
    expect(names).toContain('Show 1');
    expect(names).not.toContain('Show 2');
    // ▲ from the pills reaches the bar.
    await press(page, 'ArrowUp');
    await expect(page.locator('#searchbar')).toHaveClass(/focused/);
});

test('a genre TMDB gives a movie joins the provider genres', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
        Tmdb.enabled = () => true;
        Tmdb.cached = (item) => (item.name === 'Movie 2' ? { genres: [{ id: 53, name: 'Thriller' }] } : null);
        Tmdb.match = () => Promise.resolve(null);
    });
    await section(page, 'Movies');
    await moveTo(page, '#categories .row.focused .label', 'Recently added', 'ArrowUp');
    await enterItems(page);
    const pills = page.locator('#genre-pills .tm-chip');
    await expect(pills.nth(1)).toHaveText('Thriller');
    await press(page, 'ArrowUp');
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    // The others are looked up on their provider pages (Crime, Drama) and stay out.
    await expect(page.locator('#hints')).not.toContainText('Looking up');
    await expect(page.locator('#items .card, #items .row')).toHaveCount(1);
    await expect(page.locator('#items')).toContainText('Movie 2');
});

test('Movies have the same pills as Series and a genre is looked up on the provider movie pages', async ({ page }) => {
    let pages = 0;
    page.on('request', req => { if (new URL(req.url()).searchParams.get('action') === 'get_vod_info') pages++; });
    await boot(page);
    await section(page, 'Movies');
    await moveTo(page, '#categories .row.focused .label', 'Recently added', 'ArrowUp');
    await enterItems(page);
    const pills = page.locator('#genre-pills .tm-chip');
    await expect(pills.first()).toHaveText('All');
    await expect(pills.filter({ hasText: /^Crime$/ })).toHaveCount(1);
    await press(page, 'ArrowUp');
    await moveTo(page, '#genre-pills .tm-chip.focus', 'Crime', 'ArrowRight');
    await press(page, 'Enter');
    // The fake provider pages say Crime, Drama: the first twenty join as they are found.
    await expect(page.locator('#items .list-header .count')).toContainText('/ 20', { timeout: 30000 });
    expect(pages).toBe(20);
    await expect(page.locator('#hints')).toContainText('check 20 more (4 left)');
    // ▼ past the last row checks the next ones.
    await press(page, 'ArrowDown');
    for (let i = 0; i < 4; i++) await press(page, 'ArrowDown');
    await expect(page.locator('#items .list-header .count')).toContainText('/ 24', { timeout: 30000 });
    expect(pages).toBe(24);
    await expect(page.locator('#hints')).not.toContainText('Looking up');
});

test('a provider that answers 429 stops the genre lookups at once', async ({ page }) => {
    let pages = 0;
    await page.route(/action=get_vod_info/, (route) => {
        pages++;
        return route.fulfill({ status: 429, body: 'Too Many Requests' });
    });
    await boot(page);
    await section(page, 'Movies');
    await moveTo(page, '#categories .row.focused .label', 'Recently added', 'ArrowUp');
    await enterItems(page);
    await press(page, 'ArrowUp');
    await moveTo(page, '#genre-pills .tm-chip.focus', 'Crime', 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('.list-empty')).toContainText('Nothing in Crime here');
    await page.waitForTimeout(1500);
    expect(pages).toBe(1);
    // Picking again within the rest asks the provider nothing.
    await press(page, 'Enter');
    await press(page, 'Enter');
    await page.waitForTimeout(1000);
    expect(pages).toBe(1);
});
