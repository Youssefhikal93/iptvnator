const { test, expect, boot, openFirst, resumeSeed, back, press, playing } = require('./helpers');

test('OK opens movie plot, cast and actions; Return restores the selected movie', async ({ page }) => {
    await boot(page);
    await openFirst(page, 'Movies');
    await expect(page.locator('.dt-title')).toHaveText('Movie 25: The Long Title');
    await expect(page.locator('.dt-plot')).toContainText('A retired detective returns');
    await expect(page.locator('.dt-credit').first()).toContainText('Ana Lindqvist, Omar Haddad, Lena Berg');
    await expect(page.locator('.dt-btn.primary')).toContainText('Play');
    await expect(page.locator('.dt-buttons')).toContainText('Add to Favorites');
    await back(page);
    await expect(page.locator('#detail')).toBeHidden();
    await expect(page.locator('#items .focused .card-title')).toHaveText('Movie 25');
});

test('saved progress offers Resume from X and Start over; Start over starts at zero', async ({ page }) => {
    await boot(page, resumeSeed());
    await openFirst(page, 'Movies');
    await expect(page.locator('#detail .dt-btn.primary')).toContainText('Resume from 3:20');
    await expect(page.locator('#detail .dt-btn').nth(1)).toHaveText('Start over');
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await playing(page);
    expect(await page.locator('#video').evaluate(v => v.currentTime)).toBeLessThan(10);
    await expect(page.locator('#pl-resume')).toBeHidden();
});
