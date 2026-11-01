const { test, expect, boot, press, setting } = require('./helpers');

// The TV app is called Jotv (#65); the exit question is covered in exit.spec.js.
test('the page title and the About group name the app Jotv and credit IPTVnator', async ({ page }) => {
    await boot(page);
    await expect(page).toHaveTitle('Jotv');
    await setting(page, 'App version');
    const row = label => page.locator('.st-row').filter({ has: page.locator('.st-label', { hasText: label }) });
    await expect(row('App').first().locator('.st-value')).toHaveText('Jotv');
    await expect(page.locator('.st-row .st-label', { hasText: 'Based on IPTVnator' })).toHaveCount(1);
});
