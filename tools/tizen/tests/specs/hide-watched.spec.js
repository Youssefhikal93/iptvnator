const { test, expect, boot, resumeSeed, movie, section, category, enterItems, toolbar, press, holdOK, menuChoice, setting, moveTo } = require('./helpers');

const button = page => page.locator('[data-mode="hide-watched"]');
async function toggle(page) {
    await toolbar(page, 'hide-watched');
    await press(page, 'Enter');
    await press(page, 'ArrowDown');
}
function finishedSeed() {
    const seed = resumeSeed();
    seed.storage.progress['movie:2025'].position = 400;
    seed.storage['favorites:s1'] = { movies: [movie()] };
    return seed;
}

test('finished movies disappear, counts follow, focus moves to the nearest title and search still finds them', async ({ page }) => {
    await boot(page, finishedSeed());
    await section(page, 'Movies');
    await enterItems(page);
    await toggle(page);
    await expect(button(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#items .count')).toHaveText('1 / 24');
    await expect(page.locator('#items .focused .card-title')).toHaveText('Movie 24');
    await expect(page.locator('#items .card-title')).not.toContainText(['Movie 25']);
    const favorites = page.locator('#categories .row').filter({ has: page.locator('.label', { hasText: /^Favorites$/ }) });
    await expect(favorites.locator('.badge')).toHaveText('0');
    await expect(page.locator('#categories .row.selected .badge')).toHaveText('24');
    await toolbar(page, 'search');
    await press(page, 'Enter');
    await page.keyboard.type('Movie 25');
    await press(page, 'Enter');
    await expect(page.locator('#items .card-title')).toHaveText('Movie 25');
    await section(page, 'Live TV');
    await expect(button(page)).toBeHidden();
});

test('fully watched known series disappear without requesting details while filtering', async ({ page }) => {
    await boot(page);
    await section(page, 'Series');
    await enterItems(page);
    const title = await page.locator('#items .focused .card-title').innerText();
    await holdOK(page);
    await menuChoice(page, 'Mark show as watched');
    await expect(page.locator('#items .focused .watched-tick')).toBeVisible();
    const details = [];
    page.on('request', req => { if (req.url().includes('get_series_info')) details.push(req.url()); });
    await toggle(page);
    await expect(page.locator('#items .count')).toHaveText('1 / 14');
    await expect(page.locator('#items .card-title')).not.toContainText([title]);
    expect(details).toHaveLength(0);
    const remaining = await page.locator('#items .focused .card-title').innerText();
    await toggle(page);
    await expect(page.locator('#items .focused .card-title')).toHaveText(remaining);
});

test('the all-watched empty state restores titles with the remote', async ({ page }) => {
    await boot(page, finishedSeed());
    await section(page, 'Movies');
    await category(page, 'Favorites');
    await enterItems(page);
    await toggle(page);
    await expect(page.locator('#items .list-empty')).toContainText("You've watched everything here");
    await expect(page.locator('#items button.focused')).toHaveText('Show watched titles');
    await press(page, 'Enter');
    await expect(button(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#items .focused .card-title')).toHaveText('Movie 25');
});

test('choice survives reload, is shared by Movies and Series, and leaves Home unchanged', async ({ page }) => {
    await boot(page, finishedSeed());
    await expect(page.locator('#home')).toContainText('Movie 25');
    await section(page, 'Movies');
    await enterItems(page);
    await toggle(page);
    await page.reload();
    await expect(page.locator('#home')).toContainText('Movie 25');
    await section(page, 'Movies');
    await expect(button(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#items .count')).toHaveText('1 / 24');
    await section(page, 'Series');
    await expect(button(page)).toHaveAttribute('aria-pressed', 'true');
});

test('a new profile starts with the switch off and switching back restores the choice', async ({ page }) => {
    await boot(page, finishedSeed());
    await section(page, 'Movies');
    await enterItems(page);
    await toggle(page);
    await setting(page, 'Add profile…');
    await press(page, 'Enter');
    await page.locator('#profile-name').fill('Anna');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#profile-dialog')).toHaveCount(0);
    await section(page, 'Movies');
    await expect(button(page)).toHaveAttribute('aria-pressed', 'false');
    await page.reload();
    await expect(page.locator('#profiles')).toBeVisible();
    await press(page, 'ArrowLeft');
    await moveTo(page, '#profiles .pf-tile.focused .pf-name', 'Me', 'ArrowLeft');
    await press(page, 'Enter');
    await expect(page.locator('#profiles')).toHaveCount(0);
    await section(page, 'Movies');
    await expect(button(page)).toHaveAttribute('aria-pressed', 'true');
});

test('catalogue navigation adds no extra storage reads or requests with Hide watched on', async ({ page }) => {
    await boot(page, finishedSeed());
    await section(page, 'Movies');
    await enterItems(page);
    const count = Number((await page.locator('#items .count').innerText()).split('/')[1]);
    if (process.env.FAKE_CATALOGUE) expect(count).toBe(Number(process.env.FAKE_CATALOGUE));
    async function measure() {
        return page.evaluate(async () => {
            let reads = 0;
            const original = Storage.prototype.getItem;
            Storage.prototype.getItem = function (key) { reads++; return original.call(this, key); };
            const times = [];
            try {
                for (let i = 0; i < 60; i++) {
                    const keyCode = i % 2 ? 37 : 39;
                    const start = performance.now();
                    document.dispatchEvent(new KeyboardEvent('keydown', { keyCode, which: keyCode, bubbles: true }));
                    document.dispatchEvent(new KeyboardEvent('keyup', { keyCode, which: keyCode, bubbles: true }));
                    document.querySelector('#items').offsetHeight;
                    if (i >= 10) times.push(performance.now() - start);
                    await Promise.resolve(); // Let Stored start the next key's read cache.
                }
            } finally { Storage.prototype.getItem = original; }
            times.sort((a, b) => a - b);
            return { reads, medianMs: times[Math.floor(times.length / 2)] };
        });
    }
    const off = await measure();
    await toggle(page);
    await expect(page.locator('#items .count')).toHaveText('1 / ' + (count - 1));
    const requests = [];
    const capture = req => { if (req.url().includes('player_api.php')) requests.push(req.url()); };
    page.on('request', capture);
    const on = await measure();
    page.off('request', capture);
    expect(on.reads).toBe(off.reads);
    expect(requests).toHaveLength(0);
    console.log('Hide watched navigation:', JSON.stringify({ count, off, on }));
});

// Moving between categories must not recount the catalogue: counts change
// only when the switch or the watched titles do.
test('moving through categories costs the same with Hide watched on', async ({ page }) => {
    await boot(page, finishedSeed());
    await section(page, 'Movies');
    await enterItems(page);
    await toggle(page);
    await toggle(page);
    await press(page, 'ArrowLeft');
    async function measure() {
        return page.evaluate(async () => {
            let reads = 0;
            const original = Storage.prototype.getItem;
            Storage.prototype.getItem = function (key) { reads++; return original.call(this, key); };
            const times = [];
            try {
                for (let i = 0; i < 40; i++) {
                    const keyCode = i % 2 ? 38 : 40;
                    const start = performance.now();
                    document.dispatchEvent(new KeyboardEvent('keydown', { keyCode, which: keyCode, bubbles: true }));
                    document.dispatchEvent(new KeyboardEvent('keyup', { keyCode, which: keyCode, bubbles: true }));
                    document.querySelector('#items').offsetHeight;
                    if (i >= 6) times.push(performance.now() - start);
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            } finally { Storage.prototype.getItem = original; }
            times.sort((a, b) => a - b);
            return { reads, medianMs: times[Math.floor(times.length / 2)] };
        });
    }
    const off = await measure();
    await enterItems(page);
    await toggle(page);
    await press(page, 'ArrowLeft');
    await expect(button(page)).toHaveAttribute('aria-pressed', 'true');
    const on = await measure();
    expect(on.reads).toBeLessThanOrEqual(off.reads);
    console.log('Hide watched categories:', JSON.stringify({ off, on }));
});
