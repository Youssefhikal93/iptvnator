const { test, expect, boot, resumeSeed, movie, show, channel, press, playing } = require('./helpers');

test('home hero resumes progress and rows show continue, favorites and recently added', async ({ page }) => {
    const seed = resumeSeed();
    seed.storage['favorites:s1'] = { movies: [movie(7)], series: [show()], live: [channel()] };
    await boot(page, seed);
    await expect(page.locator('.hm-eyebrow')).toContainText('Continue watching');
    await expect(page.locator('.hm-hero-title')).toHaveText('Movie 25');
    await expect(page.locator('.hm-hero-fill')).toHaveCSS('width', /\d+px/);
    const seen = new Set();
    for (let i = 0; i < 9; i++) {
        for (const title of await page.locator('.hm-row-title').allTextContents()) seen.add(title);
        await press(page, 'ArrowDown');
    }
    for (const title of ['Continue watching', 'Live now on your favorite channels', 'Favorite movies', 'Favorite series', 'Recently added movies', 'Recently added series']) expect(seen.has(title)).toBe(true);
    // Return to the hero by reading its focused button, then resume directly.
    for (let i = 0; i < 10 && !await page.locator('.hm-hero-buttons .focus').count(); i++) await press(page, 'ArrowUp');
    await expect(page.locator('.hm-hero-buttons .focus')).toContainText('Continue watching');
    await press(page, 'Enter');
    await playing(page);
    await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(195);
});
