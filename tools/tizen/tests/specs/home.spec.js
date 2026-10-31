const { test, expect, boot, resumeSeed, movie, show, channel, press, back, playing, section, moveTo, enterItems, toolbar, setting, choose } = require('./helpers');

// Holds OK on Home and waits for what it opens (the item menu by default).
async function holdOK(page, opens = '#menu') {
    await page.keyboard.down('Enter');
    await page.waitForTimeout(800); // The app's long-press threshold is 600 ms.
    await page.keyboard.up('Enter');
    await expect(page.locator(opens)).toBeVisible();
}

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

// The hero shows Movie 25; the Continue watching row under it has Movie 24, 100 s in.
function twoUnfinished() {
    const seed = resumeSeed();
    seed.storage.progress['movie:2024'] = { position: 100, duration: 400, updatedAt: 50 };
    seed.storage['recent:s1'].movies.push(movie(24));
    seed.storage['favorites:s1'] = { movies: [movie(7)] };
    return seed;
}

test('OK in Continue watching plays on from where it stopped; holding OK opens the menu with Details first', async ({ page }) => {
    await boot(page, twoUnfinished());
    await press(page, 'ArrowDown');
    await expect(page.locator('.hm-row.focused, .hm-row:has(.hm-card.focus) > h2').first()).toContainText('Continue watching');
    await expect(page.locator('.hm-card.focus')).toContainText('Movie 24');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-resume')).toBeHidden();
    await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(95);
    for (let i = 0; i < 6 && await page.locator('#player').isVisible(); i++) await back(page);
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('.hm-card.focus')).toContainText('Movie 24');
    await holdOK(page);
    await expect(page.locator('#menu .menu-row').nth(0)).toHaveText('Details');
    await expect(page.locator('#menu .menu-row').nth(1)).toHaveText('Play');
    await expect(page.locator('#menu .menu-row').nth(2)).toHaveText('Add to Favorites');
    await expect(page.locator('#menu .menu-row.focused')).toHaveText('Details');
    await press(page, 'Enter');
    await expect(page.locator('#detail')).toContainText('Movie 24');
    await back(page);
    await expect(page.locator('#detail')).toBeHidden();
    // Play in the menu plays on from where it stopped, as OK does.
    await holdOK(page);
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-resume')).toBeHidden();
    await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(95);
    for (let i = 0; i < 6 && await page.locator('#player').isVisible(); i++) await back(page);
    // Elsewhere on Home the menu also starts with Details.
    await press(page, 'ArrowDown');
    await expect(page.locator('.hm-card.focus')).toContainText('Movie 7');
    await holdOK(page);
    await expect(page.locator('#menu .menu-row.focused')).toHaveText('Details');
});

test('holding OK on a series or an unfinished episode puts Details first, each row with its icon', async ({ page }) => {
    await boot(page, twoUnfinished());
    await section(page, 'Series');
    await enterItems(page);
    await holdOK(page);
    await expect(page.locator('#menu .menu-row').first()).toHaveText('Details');
    await expect(page.locator('#menu .menu-row', { hasText: 'Play' })).toHaveCount(0);
    for (const row of await page.locator('#menu .menu-row').all()) await expect(row).toHaveAttribute('data-glyph', /./);
});

test('below the hero, the row above stays in view as the faded bottom edge of its tiles', async ({ page }) => {
    await boot(page, twoUnfinished());
    await expect(page.locator('.hm-peek')).toHaveCount(0);
    await press(page, 'ArrowDown');
    // Under the hero: the bottom of its picture, no buttons.
    await expect(page.locator('.hm-peek.hero')).toHaveCount(1);
    await expect(page.locator('.hm-peek .hm-hero-buttons')).toHaveCount(0);
    await press(page, 'ArrowDown');
    // Further down: the Continue watching tiles, without the row's title.
    await expect(page.locator('.hm-peek .hm-card')).toContainText(['Movie 24']);
    await expect(page.locator('.hm-peek h2')).toBeHidden();
    await expect(page.locator('.hm-card.focus')).toContainText('Movie 7');
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
    await setting(page, 'Top bar');
    await choose(page, 'Off');
    await expect(page.locator('.st-row.focused')).toContainText('Off');
    await section(page, 'Movies');
    await expect(page.locator('#header')).toBeHidden();
    await enterItems(page);
    await toolbar(page, 'search');
    await expect(page.locator('#header')).toBeVisible();
    await press(page, 'ArrowDown');
    await expect(page.locator('#header')).toBeHidden();
});
