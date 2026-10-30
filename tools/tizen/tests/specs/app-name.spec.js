const { test, expect, boot, press, setting } = require('./helpers');

// The TV app is called Jo-TV (#65); the exit question is covered in exit.spec.js.
test('the page title and the About group name the app Jo-TV and credit IPTVnator', async ({ page }) => {
    await boot(page);
    await expect(page).toHaveTitle('Jo-TV');
    await setting(page, 'App version');
    const row = label => page.locator('.st-row').filter({ has: page.locator('.st-label', { hasText: label }) });
    await expect(row('App').first().locator('.st-value')).toHaveText('Jo-TV');
    await expect(page.locator('.st-row .st-label', { hasText: 'Based on IPTVnator' })).toHaveCount(1);
});
