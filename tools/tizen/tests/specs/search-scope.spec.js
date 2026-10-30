const { test, expect, boot, section, category, enterItems, toolbar, press, moveTo } = require('./helpers');

// #69: the bar searches the category in use; All movies / All series search
// the whole section, Collections its collections. The placeholder says which.

// Category 2 has three films; every other list has Movie 1 to 25.
async function smallCategory(page) {
    await page.route(/action=get_vod_streams&category_id=2(&|$)/, async (route) => {
        const response = await route.fetch();
        const list = await response.json();
        await route.fulfill({ response, json: list.slice(0, 3) });
    });
}

async function search(page, text) {
    await expect(page.locator('#items .skeleton')).toHaveCount(0);
    await enterItems(page);
    await toolbar(page, 'search');
    await press(page, 'Enter');
    await page.locator('#search-input').fill(text);
    await press(page, 'Enter');
    await expect(page.locator('#items .skeleton')).toHaveCount(0);
}

const names = page => page.locator('#items .card .card-title').allTextContents();

test('a category searches only its own films and says so; All movies searches them all', async ({ page }) => {
    await smallCategory(page);
    await boot(page);
    await section(page, 'Movies');
    await category(page, 'get_vod_categories cat 2');
    await expect(page.locator('#search-input')).toHaveAttribute('placeholder', 'Search in get_vod_categories cat 2…');
    await search(page, 'Movie 2');
    const inCategory = await names(page);
    expect(inCategory.length).toBeGreaterThan(0);
    expect(inCategory.every(name => ['Movie 1', 'Movie 2', 'Movie 3'].includes(name))).toBe(true);

    await search(page, 'Movie 25');
    await expect(page.locator('#items .list-empty')).toContainText('Only get_vod_categories cat 2 was searched');

    // All movies: the whole section. ▼ from the bar goes back to the categories.
    await press(page, 'ArrowDown');
    await expect(page.locator('#categories .focused')).toHaveCount(1);
    await moveTo(page, '#categories .focused .label', 'All movies', 'ArrowUp');
    await expect(page.locator('#items .list-header')).toContainText('All movies');
    await expect(page.locator('#search-input')).toHaveAttribute('placeholder', 'Search all movies…');
    await search(page, 'Movie 25');
    expect(await names(page)).toContain('Movie 25');
});

test('Series and Live TV name their All row in the placeholder', async ({ page }) => {
    await boot(page);
    await section(page, 'Series');
    await expect(page.locator('#search-input')).toHaveAttribute('placeholder', 'Search in get_series_categories cat 1…');
    await moveTo(page, '#categories .focused .label', 'All series', 'ArrowUp');
    await expect(page.locator('#search-input')).toHaveAttribute('placeholder', 'Search all series…');
    await section(page, 'Live TV');
    await moveTo(page, '#categories .focused .label', 'All channels', 'ArrowUp');
    await expect(page.locator('#search-input')).toHaveAttribute('placeholder', 'Search all channels…');
});
