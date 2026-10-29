const { test, expect, boot, press, back, section, enterItems, toolbar, setting } = require('./helpers');

// Movies and Series as Wide picture boxes or Info boxes (#66).

async function view(page, mode) {
    await enterItems(page);
    // The toolbar helper starts from the top row of items.
    for (let i = 0; i < 8 && !(await page.locator('#items .count').innerText()).match(/^[1-4] \//); i++) await press(page, 'ArrowUp');
    await toolbar(page, mode);
    await press(page, 'Enter');
    await expect(page.locator(`.view-btn[data-mode="${mode}"]`)).toHaveClass(/active/);
    await press(page, 'ArrowDown');
}

// Real Xtream series lists carry a plot, a rating and a release date; the fake one does not.
async function richSeries(page) {
    await page.route(/action=get_series(&|$)/, async (route) => {
        const response = await route.fetch();
        const list = await response.json();
        list.forEach((show, i) => Object.assign(show, { plot: 'Show ' + i + ' plot: a town keeps a secret.', rating: '8.1', releaseDate: '2019-09-01', episode_run_time: '45' }));
        await route.fulfill({ response, json: list });
    });
}

test('Wide picture boxes show the picture with title and meta, and the remote moves by rows', async ({ page }) => {
    await boot(page);
    await section(page, 'Movies');
    await view(page, 'wide');
    await expect(page.locator('#items')).toHaveClass(/boxes-wide/);
    const boxes = page.locator('#items .card.box.wide');
    await expect(boxes.first()).toBeVisible();
    // Compact density: 4 boxes a row, 4 rows on screen.
    await expect(boxes).toHaveCount(16);
    await expect(boxes.first().locator('.card-title')).toHaveText(/Movie/);
    await expect(boxes.nth(1).locator('.box-meta')).toContainText('★');
    await expect(page.locator('#items .card.focused.box')).toHaveCount(1);
    await press(page, 'ArrowDown');
    await expect(page.locator('#items .count')).toHaveText(/^5 \//);
    await press(page, 'ArrowRight');
    await expect(page.locator('#items .count')).toHaveText(/^6 \//);
});

test('Info boxes show a poster, the meta and two lines of plot; the choice is kept per section after a reload', async ({ page }) => {
    await richSeries(page);
    await boot(page, { storage: { settings: { density: 'comfortable' } } });
    await section(page, 'Series');
    await view(page, 'info');
    const box = page.locator('#items .card.box.info').first();
    await expect(box.locator('.poster')).toBeVisible();
    await expect(box.locator('.box-meta')).toHaveText('2019 · ★ 8.1 · 45 min');
    await expect(box.locator('.box-plot')).toContainText('a town keeps a secret');
    await expect(page.locator('#items .card.box.info')).toHaveCount(8);
    await press(page, 'ArrowDown');
    await expect(page.locator('#items .count')).toHaveText(/^3 \//);

    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-source', 'Regression TV');
    await section(page, 'Series');
    await expect(page.locator('#items')).toHaveClass(/boxes-info/);
    // Movies kept its own view.
    await section(page, 'Movies');
    await expect(page.locator('#items .card.box')).toHaveCount(0);
    await expect(page.locator('#items .card').first()).toBeVisible();
});

test('Live TV has no box views, and Settings offers them for Movies and Series', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'ArrowUp');
    await expect(page.locator('#searchbar')).toHaveClass(/focused/);
    await expect(page.locator('.view-btn[data-mode="wide"]')).toHaveClass(/hidden/);
    await expect(page.locator('.view-btn[data-mode="info"]')).toHaveClass(/hidden/);
    await setting(page, 'Default view for Movies');
    await press(page, 'Enter');
    await expect(page.locator('#menu')).toContainText('Wide boxes');
    await expect(page.locator('#menu')).toContainText('Info boxes');
});

// Storage reads and requests (other than artwork) for a few moves in the items.
async function moves(page) {
    const requests = [];
    const seen = (request) => { if (!/\/img\//.test(request.url())) requests.push(request.url()); };
    page.on('request', seen);
    await page.evaluate(() => {
        window.__reads = 0;
        if (window.__counting) return;
        window.__counting = true;
        const get = Storage.prototype.getItem;
        Storage.prototype.getItem = function () { window.__reads++; return get.apply(this, arguments); };
    });
    // Every key moves in all three layouts (6, 4 and 2 columns).
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft']) await press(page, key);
    await expect(page.locator('#items .count')).not.toHaveText(/^1 \//);
    page.off('request', seen);
    return { requests, reads: await page.evaluate(() => window.__reads) };
}

test('box views send no request and read storage no more than the poster grid while moving', async ({ page }) => {
    await boot(page);
    await section(page, 'Movies');
    await enterItems(page);
    const grid = await moves(page);
    await section(page, 'Movies');
    await view(page, 'wide');
    const wide = await moves(page);
    expect(wide.requests).toEqual([]);
    expect(wide.reads).toBe(grid.reads);
    await section(page, 'Movies');
    await view(page, 'info');
    const info = await moves(page);
    expect(info.requests).toEqual([]);
    expect(info.reads).toBe(grid.reads);
});
