const { test, expect, boot, section, category, enterItems, toolbar, press, menuChoice, back } = require('./helpers');

async function sort(page, label) {
    await toolbar(page, 'sort');
    await press(page, 'Enter');
    await menuChoice(page, label);
}

test('Live TV has no sort; Movies default newest, top-rated ties keep provider order and undated is last', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await expect(page.locator('[data-mode="sort"]')).toBeHidden();
    await section(page, 'Movies');
    await expect(page.locator('#items .list-subtitle')).toHaveText('Sorted by newest');
    await expect(page.locator('#items .card-title').first()).toHaveText('Movie 25');
    await expect(page.locator('[data-mode="sort"]')).toBeVisible();
    await enterItems(page);
    await sort(page, 'Top rated');
    await expect(page.locator('#items .card-title').nth(0)).toHaveText('Movie 7');
    await expect(page.locator('#items .card-title').nth(1)).toHaveText('Movie 17');
    await expect(page.locator('#items .card-title').nth(2)).toHaveText('Movie 4');
    await expect(page.locator('#items .card-title').nth(3)).toHaveText('Movie 14');
    await sort(page, 'Oldest');
    await expect(page.locator('#items .card-title').first()).toHaveText('Movie 1');
    // Walk to the end by observing the displayed position (the grid is virtual).
    while ((await page.locator('#items .count').innerText()) !== '25 / 25') await press(page, 'ArrowRight');
    await expect(page.locator('#items .focused .card-title')).toHaveText('Movie 5');
    await back(page);
    await category(page, 'Recently added');
    await expect(page.locator('#items .count')).toHaveText('1 / 24');
    await expect(page.locator('#items .list-subtitle')).toHaveText('Sorted by newest');
});
