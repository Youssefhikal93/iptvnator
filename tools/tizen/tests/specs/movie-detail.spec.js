const { test, expect, boot, openFirst, resumeSeed, back, press, playing } = require('./helpers');

test('OK opens movie plot, cast and actions; Return restores the selected movie', async ({ page }) => {
    await boot(page);
    await openFirst(page, 'Movies');
    await expect(page.locator('.dt-title')).toHaveText('Movie 25: The Long Title');
    await expect(page.locator('.dt-plot')).toContainText('A retired detective returns');
    await expect(page.locator('.dt-credit').first()).toContainText('Ana Lindqvist, Omar Haddad, Lena Berg');
    // #46: an eyebrow and the facts as chips; the rating chip stands out.
    await expect(page.locator('.dt-eyebrow')).toHaveText('Movies  ·  Crime');
    await expect(page.locator('.dt-chip')).toHaveText(['2021', '1 h 52 min', '★ 7.4', 'Crime', 'Drama']);
    await expect(page.locator('.dt-chip.rating')).toHaveText('★ 7.4');
    await expect(page.locator('.dt-btn.primary')).toContainText('Play');
    await expect(page.locator('.dt-buttons')).toContainText('Add to Favorites');
    await back(page);
    await expect(page.locator('#detail')).toBeHidden();
    await expect(page.locator('#items .focused .card-title')).toHaveText('Movie 25');
});

test('"More in <category>" lists the other titles of the category from the saved list; OK opens one (#47)', async ({ page }) => {
    await boot(page);
    await openFirst(page, 'Movies');
    await expect(page.locator('.dt-title')).toHaveText('Movie 25: The Long Title');
    const row = page.locator('#detail .tm-row.related');
    await expect(row).toBeVisible();
    await expect(row.locator('h2')).toHaveText(/^More in get_vod_categories cat \d+$/);
    expect(await row.locator('.tm-card').count()).toBeGreaterThan(3);
    await expect(row.locator('.tm-card', { hasText: /^Movie 25$/ })).toHaveCount(0);
    // No TMDB key: the library row is the only one, under the buttons.
    await expect(page.locator('#detail .tm-row')).toHaveCount(1);
    await press(page, 'ArrowDown');
    await expect(row.locator('.tm-card').first()).toHaveClass(/focus/);
    await press(page, 'ArrowRight');
    const next = (await row.locator('.tm-card.focus').innerText()).trim();
    await press(page, 'ArrowUp');
    await expect(page.locator('#detail .dt-btn.focus')).toContainText('Play');
    // Leaving the rows starts them again at the first title.
    await press(page, 'ArrowDown');
    await expect(row.locator('.tm-card').first()).toHaveClass(/focus/);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('.dt-title')).toHaveText(next + ': The Long Title');
});

test('saved progress offers Resume from X and Start over; Start over starts at zero', async ({ page }) => {
    await boot(page, resumeSeed());
    await openFirst(page, 'Movies');
    await expect(page.locator('#detail .dt-btn.primary')).toContainText('Resume from 3:20');
    await expect(page.locator('#detail .dt-btn').nth(1)).toHaveText('Start over');
    // The resume line sits under the Resume pill, not inside it.
    expect(await page.locator('#detail .dt-btn.primary').evaluate(node => node.offsetHeight)).toBe(88);
    const pill = await page.locator('#detail .dt-btn.primary').boundingBox();
    const line = await page.locator('#detail .dt-btn.primary .dt-btn-bar').boundingBox();
    expect(line.y).toBeGreaterThanOrEqual(pill.y + pill.height - 1);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await playing(page);
    expect(await page.locator('#video').evaluate(v => v.currentTime)).toBeLessThan(10);
    await expect(page.locator('#pl-resume')).toBeHidden();
});

test('moving between buttons keeps the same backdrop and poster images', async ({ page }) => {
    await boot(page);
    await openFirst(page, 'Movies');
    await page.evaluate(() => { window.__art = [...document.querySelectorAll('#detail .dt-backdrop, #detail .dt-poster')]; });
    await press(page, 'ArrowRight');
    await expect(page.locator('#detail .dt-btn.focus')).toHaveText('Add to Favorites');
    await press(page, 'ArrowLeft');
    expect(await page.evaluate(() => window.__art.length === 2 && window.__art.every(node => node.isConnected))).toBe(true);
});
