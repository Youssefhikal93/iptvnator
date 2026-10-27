const { test, expect, boot, resumeSeed, section, category, enterItems, holdOK, menuChoice, back, openFirst, press } = require('./helpers');

test('Mark as watched ticks a movie and removes it from Continue watching', async ({ page }) => {
    await boot(page, resumeSeed());
    await section(page, 'Movies');
    await enterItems(page);
    await holdOK(page);
    await menuChoice(page, 'Mark as watched');
    await expect(page.locator('#items .focused .watched-tick')).toBeVisible();
    await press(page, 'ArrowLeft'); // ◀ from the list to the categories (Back goes to the menu, #50)
    await category(page, 'Continue watching');
    await expect(page.locator('#items .list-empty')).toContainText('Nothing to continue');
});

test('episode menu marks a season; show menu marks all episodes and offers Watch again', async ({ page }) => {
    await boot(page);
    await openFirst(page, 'Series');
    await expect(page.locator('.dt-btn.primary')).toContainText('Play S1 E1');
    await press(page, 'ArrowDown');
    await expect(page.locator('.dt-ep.focus')).toContainText('Pilot 1');
    await holdOK(page);
    await menuChoice(page, 'Mark season watched');
    await expect(page.locator('.dt-ep-count')).toHaveText('7 of 7 watched');
    await expect(page.locator('.dt-btn.primary')).toContainText('Play S2 E1');
    await expect(page.locator('.dt-ep .watched-tick')).toHaveCount(5); // visible window
    await back(page);
    await back(page);
    await holdOK(page);
    await menuChoice(page, 'Mark show as watched');
    await expect(page.locator('#items .focused .watched-tick')).toBeVisible();
    await press(page, 'Enter');
    await expect(page.locator('.dt-btn.primary')).toContainText('Watch again S1 E1');
});

test('favorites can be added and removed from the remote options menu', async ({ page }) => {
    await boot(page);
    await section(page, 'Movies');
    await enterItems(page);
    await holdOK(page);
    await menuChoice(page, 'Add to Favorites');
    await expect(page.locator('#items .focused .star')).toBeVisible();
    await press(page, 'ArrowLeft'); // ◀ from the list to the categories (Back goes to the menu, #50)
    await category(page, 'Favorites');
    await expect(page.locator('#items .count')).toHaveText('1 / 1');
    await expect(page.locator('#items .card-title')).toHaveText('Movie 25');
    await enterItems(page);
    await holdOK(page);
    await menuChoice(page, 'Remove from Favorites');
    await expect(page.locator('#items .list-empty')).toContainText('No favorites yet');
});
