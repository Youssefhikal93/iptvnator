const { test, expect, boot, section, enterItems, press, playing } = require('./helpers');

test('guided live rows show now, missing guides stay empty, player shows now and next', async ({ page }) => {
    const completed = new Set();
    page.on('requestfinished', req => {
        const url = new URL(req.url());
        if (url.searchParams.get('action') === 'get_short_epg') completed.add(url.searchParams.get('stream_id'));
    });
    await boot(page);
    await section(page, 'Live TV');
    const guided = page.locator('#items .row').filter({ has: page.locator('.label', { hasText: '1. Channel 1 (' }) });
    const unguided = page.locator('#items .row').filter({ has: page.locator('.label', { hasText: '2. Channel 2 (' }) });
    await expect(guided.locator('.epg-now')).toContainText('1001');
    await expect.poll(() => completed.has('1002')).toBe(true); // 1002 is divisible by 3.
    await expect(unguided.locator('.epg-now')).toHaveCount(0);
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-epg')).toBeVisible();
    await expect(page.locator('#pl-epg .pl-epg-tag')).toHaveText(['Now', 'Next']);
    await expect(page.locator('#pl-epg .pl-epg-title')).toContainText(['1001', '1001']);
    await expect(page.locator('#pl-epg .pl-epg-desc')).not.toBeEmpty();
});
