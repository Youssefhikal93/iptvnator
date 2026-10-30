const { test, expect, boot, section, enterItems, chooseView, press, playing, channel, sendKeyCode, back } = require('./helpers');

// Channel 1 has a logo, channel 2 a dead link, channel 3 none (#44).
const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" fill="#e53935"/></svg>';
async function logos(page) {
    await page.route('**/logos/*', route => (route.request().url().endsWith('/ok.svg')
        ? route.fulfill({ contentType: 'image/svg+xml', body: LOGO })
        : route.fulfill({ status: 404, body: '' })));
    await page.route(url => url.pathname.endsWith('/player_api.php') && url.searchParams.get('action') === 'get_live_streams', async route => {
        const response = await route.fetch();
        const list = await response.json();
        const origin = new URL(route.request().url()).origin;
        list.forEach(item => { item.stream_icon = item.num === 1 ? origin + '/logos/ok.svg' : item.num === 2 ? origin + '/logos/dead.png' : ''; });
        await route.fulfill({ response, json: list });
    });
}

test('live rows and grid tiles show 16:9 plates: the logo, or the channel name when it is missing or dead', async ({ page }) => {
    await logos(page);
    await boot(page, { storage: { settings: { density: 'comfortable' } } });
    await section(page, 'Live TV');
    const rows = page.locator('#items .row.channel');
    await expect(rows.nth(0).locator('.row-plate .plate-logo')).toBeVisible();
    await expect(rows.nth(0).locator('.row-plate')).not.toHaveClass(/nologo/);
    await expect(rows.nth(1).locator('.row-plate')).toHaveClass(/nologo/);
    await expect(rows.nth(1).locator('.plate-name')).toHaveText('Channel 2 (cat all)');
    await expect(rows.nth(2).locator('.plate-name')).toHaveText('Channel 3 (cat all)');
    await expect(page.locator('#items .row .icon')).toHaveCount(0);
    // 16:9 plates in rows of 104 px; seven rows fit in Comfortable.
    const box = await rows.nth(0).locator('.row-plate').boundingBox();
    expect(Math.round(box.width / box.height * 9)).toBe(16);
    await expect(rows).toHaveCount(7);
    await expect(rows.nth(0).locator('.epg-left')).toHaveText(/min left/);

    await enterItems(page);
    await chooseView(page, 'Grid');
    const tiles = page.locator('#items .card.channel');
    await expect(tiles).toHaveCount(12);
    await expect(tiles.nth(0).locator('.poster.plate .plate-logo')).toBeVisible();
    await expect(tiles.nth(1).locator('.poster.plate')).toHaveClass(/nologo/);
    await expect(tiles.nth(1).locator('.plate-name')).toHaveText('Channel 2 (cat all)');
    // The focus stays on the toolbar after picking Grid; DOWN goes back to the channels.
    await press(page, 'ArrowDown');
    await expect(page.locator('#items .card.focused .card-title')).toHaveText('1. Channel 1 (cat all)');
    // Four columns: DOWN moves four channels on.
    await press(page, 'ArrowDown');
    await expect(page.locator('#items .card.focused .card-title')).toHaveText('5. Channel 5 (cat all)');
    // Movies keep their poster cards.
    await section(page, 'Movies');
    await expect(page.locator('#items .card.channel')).toHaveCount(0);
});

test('the player drawer, the guide and the Home live row use the same plates', async ({ page }) => {
    await logos(page);
    const fav = n => ({ ...channel(n), stream_icon: n === 2 ? 'http://localhost/logos/dead.png' : '' });
    await boot(page, { storage: { 'favorites:s1': { live: [fav(1), fav(2)] } } });
    await expect(page.locator('.hm-card.live .hm-poster.plate')).toHaveCount(2);
    await expect(page.locator('.hm-card.live .plate-name').first()).toHaveText('Channel 1 (cat all)');
    await expect(page.locator('.hm-card.live .hm-poster.plate').nth(1)).toHaveClass(/nologo/);

    await section(page, 'Live TV');
    await sendKeyCode(page, 458);
    await expect(page.locator('#guide .gd-row .gd-plate').first()).toBeVisible();
    await expect(page.locator('#guide .gd-row').first().locator('.gd-name')).toHaveText('1. Channel 1 (cat all)');
    await back(page);
    await expect(page.locator('#guide')).toBeHidden();

    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    // The first live start shows the key hints; Return hides them.
    if (await page.locator('#pl-controls').isVisible()) await back(page);
    await press(page, 'ArrowLeft');
    await expect(page.locator('#pl-channels')).toBeVisible();
    await expect(page.locator('.pl-channel').first().locator('.pl-channel-logo.plate')).toBeVisible();
});
