const { test, expect, boot, resumeSeed, movie, show, channel, press, playing, section, moveTo, enterItems, toolbar } = require('./helpers');

test('home hero resumes progress and rows show continue, favorites and recently added', async ({ page }) => {
    const seed = resumeSeed();
    // A second unfinished title: the hero shows the first, the row the rest (#45).
    seed.storage.progress['movie:2024'] = { position: 100, duration: 400, updatedAt: 50 };
    seed.storage['recent:s1'].movies.push(movie(24));
    seed.storage['favorites:s1'] = { movies: [movie(7)], series: [show()], live: [channel()] };
    await boot(page, seed);
    await expect(page.locator('.hm-eyebrow')).toContainText('Continue watching');
    await expect(page.locator('.hm-hero-title')).toHaveText('Movie 25');
    await expect(page.locator('.hm-hero-fill')).toHaveCSS('width', /\d+px/);
    const seen = new Set();
    for (let i = 0; i < 9; i++) {
        for (const title of await page.locator('.hm-row > h2').allTextContents()) seen.add(title);
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

test('the top bar shows only where it works, and Top bar Off brings it up from the top of a list (#45)', async ({ page }) => {
    await boot(page, { storage: { settings: { density: 'comfortable' } } });
    // Home has no search or view choice, and the source pill is gone.
    await expect(page.locator('#header')).toBeHidden();
    await expect(page.locator('#source-pill')).toHaveCount(0);
    await section(page, 'Movies');
    await expect(page.locator('#header')).toBeVisible();
    await section(page, 'Settings');
    await expect(page.locator('#header')).toBeHidden();
    await moveTo(page, '.st-row.focused .st-label', 'Top bar');
    await press(page, 'ArrowRight');
    await expect(page.locator('.st-row.focused')).toContainText('Off');
    await section(page, 'Movies');
    await expect(page.locator('#header')).toBeHidden();
    await enterItems(page);
    await toolbar(page, 'search');
    await expect(page.locator('#header')).toBeVisible();
    await press(page, 'ArrowDown');
    await expect(page.locator('#header')).toBeHidden();
});
