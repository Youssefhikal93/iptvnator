const { test, expect, boot, openFirst, press, back } = require('./helpers');

test('seasons show watched counts, episode descriptions and next episode from progress', async ({ page }) => {
    await boot(page, { storage: { progress: {
        'episode:4001': { position: 400, duration: 400, updatedAt: 100 },
        'episode:4002': { position: 200, duration: 400, updatedAt: 200 },
    } } });
    await openFirst(page, 'Series');
    await expect(page.locator('.dt-ep-pill')).toHaveText(['Season 1', 'Season 2']);
    await expect(page.locator('.dt-ep-count')).toHaveText('1 of 7 watched');
    await expect(page.locator('.dt-btn.primary')).toContainText('Continue S1 E2');
    await expect(page.locator('.dt-ep-title').first()).toContainText('Pilot');
    await expect(page.locator('.dt-ep-plot').first()).toContainText('The team follows a new lead.');
    await press(page, 'ArrowDown'); // selected episode
    await expect(page.locator('.dt-ep.focus')).toContainText('2. Pilot 2');
    await press(page, 'ArrowUp'); // season pills above the strip
    await expect(page.locator('.dt-ep-pill.focus')).toHaveText('Season 1');
    await press(page, 'ArrowRight');
    await expect(page.locator('.dt-ep-count')).toHaveText('0 of 2 watched');
    await expect(page.locator('.dt-ep-title')).toHaveText(['1. Return 1', '2. Return 2']);
    // Episodes are a strip of 16:9 tiles under the buttons, on the first screen (#46).
    const tiles = page.locator('.dt-ep-thumb');
    const first = await tiles.nth(0).boundingBox();
    const second = await tiles.nth(1).boundingBox();
    expect(Math.round(first.width / first.height * 9)).toBe(16);
    expect(second.x).toBeGreaterThan(first.x + first.width);
    expect(Math.abs(second.y - first.y)).toBeLessThan(2);
    expect(first.y + first.height).toBeLessThan(1080);
    await expect(page.locator('.dt-body')).toBeVisible();
    await back(page); // episodes -> buttons
    await expect(page.locator('#detail')).toBeVisible();
    await back(page);
    await expect(page.locator('#detail')).toBeHidden();
});
