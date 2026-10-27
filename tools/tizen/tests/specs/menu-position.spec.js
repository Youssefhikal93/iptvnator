const { test, expect, boot, section, enterItems, toolbar, press, back, moveTo } = require('./helpers');

// Settings > Appearance > Menu position: Side (rail) or Top (bar), and Back
// from inside a screen goes straight to the menu (#50).
const focusedSection = (page) => page.locator('#rail .rail-item.focused');

test('the menu moves between the side and the top at once and keeps its keys', async ({ page }) => {
    await boot(page, { storage: { settings: { density: 'comfortable' } } });
    const rail = await page.locator('#rail').boundingBox();
    expect(rail.width).toBe(208);
    await expect(page.locator('body')).not.toHaveClass(/menu-top/);

    await section(page, 'Settings');
    await moveTo(page, '.st-row.focused .st-label', 'Menu position');
    await expect(page.locator('.st-row.focused')).toContainText('Side');
    await press(page, 'ArrowRight');
    await expect(page.locator('body')).toHaveClass(/menu-top/);
    expect(await page.evaluate(() => Prefs.get('menuPosition'))).toBe('top');
    const bar = await page.locator('#rail').boundingBox();
    expect(bar).toMatchObject({ x: 0, y: 0, width: 1920, height: 96 });
    const content = await page.locator('#content').boundingBox();
    expect(content.x).toBe(0);
    expect(content.y).toBeGreaterThanOrEqual(96);

    // ◀/▶ walk the bar, ◀ past the first section reaches the profile, ▼ enters.
    await back(page);
    await expect(focusedSection(page)).toHaveText('Settings');
    await press(page, 'ArrowLeft');
    await expect(focusedSection(page)).toHaveText('Series');
    await section(page, 'Movies');
    await expect(page.locator('#categories .row.focused')).toHaveCount(1);
    await enterItems(page);
    await toolbar(page, 'search');
    // ▲ from the toolbar goes up to the menu.
    await press(page, 'ArrowUp');
    await expect(focusedSection(page)).toHaveText('Movies');
    await moveTo(page, '#rail .rail-item.focused', 'Home', 'ArrowLeft');
    await press(page, 'ArrowLeft');
    await expect(page.locator('#rail .rail-profile.focused')).toHaveCount(1);
    await press(page, 'ArrowRight');
    await expect(focusedSection(page)).toHaveText('Home');

    // A reload keeps the choice; switching back restores the rail.
    await page.reload();
    await expect(page.locator('body')).toHaveClass(/menu-top/);
    await page.evaluate(() => Prefs.set('menuPosition', 'side'));
    await expect(page.locator('body')).not.toHaveClass(/menu-top/);
});

test('Back from a list, the toolbar or Settings goes straight to the menu', async ({ page }) => {
    await boot(page);
    await section(page, 'Movies');
    await enterItems(page);
    await press(page, 'ArrowDown');
    await back(page);
    await expect(focusedSection(page)).toHaveText('Movies');
    await expect(page.locator('#items .focused')).toHaveCount(0);

    // The list keeps its place: back on the first item, then up to the toolbar.
    await press(page, 'ArrowRight');
    await enterItems(page);
    await press(page, 'ArrowUp');
    await toolbar(page, 'grid');
    await back(page);
    await expect(focusedSection(page)).toHaveText('Movies');

    // ◀ still steps from the list to the categories.
    await press(page, 'ArrowRight');
    await enterItems(page);
    await press(page, 'ArrowLeft');
    await expect(page.locator('#categories .row.focused')).toHaveCount(1);

    await section(page, 'Settings');
    await press(page, 'ArrowDown');
    await back(page);
    await expect(focusedSection(page)).toHaveText('Settings');
});

test('on top, ▲ at the top of a screen reaches the menu and ◀ at its left edge does not', async ({ page }) => {
    await boot(page, { storage: { settings: { menuPosition: 'top', topBar: 'on' } } });
    await expect(page.locator('body')).toHaveClass(/menu-top/);
    await section(page, 'Live TV');
    await press(page, 'ArrowLeft');
    await expect(page.locator('#categories .row.focused')).toHaveCount(1);
    await section(page, 'Settings');
    await press(page, 'ArrowUp');
    await expect(focusedSection(page)).toHaveText('Settings');
});
