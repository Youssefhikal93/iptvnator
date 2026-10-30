const { test, expect, boot, press, back, section, enterItems, toolbar, chooseView, setting } = require('./helpers');

// Movies and Series as Wide picture boxes or Info boxes (#66), picked from
// the one View button (#69).

const LABELS = { list: 'List', grid: 'Grid', wide: 'Wide boxes', info: 'Info boxes' };

async function view(page, mode) {
    await enterItems(page);
    // ▲ up the rows onto the toolbar; ▲ there stays on it.
    for (let i = 0; i < 8 && !await page.locator('#searchbar.focused, .view-btn.focused').count(); i++) await press(page, 'ArrowUp');
    await chooseView(page, LABELS[mode]);
    await expect(page.locator('.view-btn[data-mode="view"]')).toHaveAttribute('data-view', mode);
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

// Width over height of a poster box: 2:3 means the whole poster shows.
const shape = locator => locator.evaluate((el) => { const box = el.getBoundingClientRect(); return box.width / box.height; });

test('Wide boxes show the whole poster with the rating on it, the title on top, then year and length', async ({ page }) => {
    await richSeries(page);
    await boot(page);
    await section(page, 'Series');
    await view(page, 'wide');
    await expect(page.locator('#items')).toHaveClass(/boxes-wide/);
    const boxes = page.locator('#items .card.box.wide:not(.peek)');
    await expect(boxes.first()).toBeVisible();
    // Compact density: 3 boxes a row, 4 rows on screen.
    await expect(boxes).toHaveCount(12);
    const first = boxes.first();
    await expect(first.locator('.box-blur')).toHaveCount(1);
    await expect(first.locator('.poster .box-rate')).toHaveText('★ 8.1');
    await expect(first.locator('.box-text > *').first()).toHaveClass(/card-title/);
    await expect(first.locator('.box-meta')).toHaveText(['2019', '45 min']);
    expect(await shape(first.locator('.poster'))).toBeCloseTo(2 / 3, 1);
    await expect(page.locator('#items .card.focused.box')).toHaveCount(1);
    await press(page, 'ArrowDown');
    await expect(page.locator('#items .count')).toHaveText(/^4 \//);
    await press(page, 'ArrowRight');
    await expect(page.locator('#items .count')).toHaveText(/^5 \//);
});

test('Info boxes show the whole poster, the meta with a yellow rating and the plot; the choice is kept per section after a reload', async ({ page }) => {
    await richSeries(page);
    await boot(page, { storage: { settings: { density: 'comfortable' } } });
    await section(page, 'Series');
    await view(page, 'info');
    const box = page.locator('#items .card.box.info').first();
    await expect(box.locator('.poster')).toBeVisible();
    expect(await shape(box.locator('.poster'))).toBeCloseTo(2 / 3, 1);
    await expect(box.locator('.box-meta')).toHaveText('2019 · ★ 8.1 · 45 min');
    const star = await box.locator('.box-star').evaluate(el => getComputedStyle(el).color);
    const yellow = await page.evaluate(() => { const probe = document.createElement('span'); probe.style.color = 'var(--star)'; document.body.appendChild(probe); const color = getComputedStyle(probe).color; probe.remove(); return color; });
    expect(star).toBe(yellow);
    await expect(box.locator('.box-plot')).toContainText('a town keeps a secret');
    await expect(page.locator('#items .card.box.info:not(.peek)')).toHaveCount(6);
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

test('the Grid shows each poster whole: its box has the poster\'s 2:3 shape in both densities', async ({ page }) => {
    for (const density of ['compact', 'comfortable']) {
        await boot(page, { storage: { settings: { density } } });
        await section(page, 'Movies');
        const poster = page.locator('#items .card .poster').first();
        await expect(poster).toBeVisible();
        expect(await shape(poster)).toBeCloseTo(2 / 3, 2);
        expect(await shape(poster.locator('.icon'))).toBeCloseTo(2 / 3, 2);
    }
});

test('one View button: its menu ticks the layout in use; Live TV offers only List and Grid', async ({ page }) => {
    await boot(page);
    await section(page, 'Movies');
    await enterItems(page);
    await toolbar(page, 'view');
    await expect(page.locator('#view-toggle .view-btn[data-mode="view"]')).toHaveAttribute('data-view', 'grid');
    await press(page, 'Enter');
    await expect(page.locator('#menu .menu-row .menu-label')).toHaveText(['List', 'Grid', 'Wide boxes', 'Info boxes']);
    await expect(page.locator('#menu .menu-row .menu-view-icon')).toHaveCount(4);
    // The layout in use is ticked and has the focus.
    await expect(page.locator('#menu .menu-row:has(.menu-check) .menu-label')).toHaveText('Grid');
    await expect(page.locator('#menu .menu-row.focused .menu-label')).toHaveText('Grid');
    await press(page, 'Escape');
    await expect(page.locator('#menu')).toBeHidden();

    await section(page, 'Live TV');
    await enterItems(page);
    await toolbar(page, 'view');
    await press(page, 'Enter');
    await expect(page.locator('#menu')).toContainText('List');
    await expect(page.locator('#menu')).not.toContainText('Wide boxes');
    await expect(page.locator('#menu')).not.toContainText('Info boxes');
    await press(page, 'Escape');
    await setting(page, 'Default view for Movies');
    await press(page, 'Enter');
    await expect(page.locator('#menu')).toContainText('Wide boxes');
    await expect(page.locator('#menu')).toContainText('Info boxes');
});

test('the top of the next row shows dimmed under the grid and the boxes, so the list visibly goes on', async ({ page }) => {
    await boot(page);
    await section(page, 'Movies');
    const cards = page.locator('#items .card:not(.peek)');
    const peek = page.locator('#items .card.peek');
    await expect(cards.first()).toBeVisible();
    // Compact Grid: 6 a row, 2 rows, then 6 dimmed.
    await expect(cards).toHaveCount(12);
    await expect(peek).toHaveCount(6);
    expect(Number(await peek.first().evaluate(el => getComputedStyle(el).opacity))).toBeLessThan(1);
    await view(page, 'wide');
    await expect(page.locator('#items .card.box.peek')).toHaveCount(3);
});

// Storage reads and requests (other than artwork and the app's own log lines)
// for a few moves in the items.
async function moves(page) {
    const requests = [];
    const seen = (request) => { if (!/\/img\/|\/log$/.test(request.url())) requests.push(request.url()); };
    page.on('request', seen);
    await page.evaluate(() => {
        window.__reads = 0;
        if (window.__counting) return;
        window.__counting = true;
        const get = Storage.prototype.getItem;
        Storage.prototype.getItem = function () { window.__reads++; return get.apply(this, arguments); };
    });
    // Every key moves in all three layouts (6, 3 and 2 columns).
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft']) await press(page, key);
    await expect(page.locator('#items .count')).not.toHaveText(/^1 \//);
    page.off('request', seen);
    return { requests, reads: await page.evaluate(() => window.__reads) };
}

test('#73 a Wide box shows a show\'s seasons once its episodes are loaded, and a film\'s length from TMDB, each after an icon', async ({ page }) => {
    await page.route('https://image.tmdb.org/**', (route) => route.fulfill({ status: 404 }));
    await page.route('https://api.themoviedb.org/**', (route) => {
        const url = new URL(route.request().url());
        const endpoint = url.pathname.replace('/3', '');
        if (endpoint === '/search/movie') return route.fulfill({ json: { results: url.searchParams.get('query') === 'Movie 25' ? [{ id: 25, title: 'Movie 25' }] : [] } });
        if (endpoint === '/movie/25') return route.fulfill({ json: { id: 25, title: 'Movie 25', runtime: 112 } });
        return route.fulfill({ status: 404, json: { status_message: 'Not found' } });
    });
    await boot(page, { storage: { settings: { tmdbApiKey: 'test-key' } } });
    // Nothing known yet: a show's box has only its year line.
    await section(page, 'Series');
    await view(page, 'wide');
    const firstShow = page.locator('#items .card.box.wide').first();
    await expect(firstShow.locator('.box-fact')).toHaveCount(0);
    // Its detail page loads the episodes; back on the list the box counts the seasons.
    await press(page, 'Enter');
    await expect(page.locator('#detail .dt-ep-pill').first()).toBeVisible();
    const pills = await page.locator('#detail .dt-ep-pill').count();
    await back(page);
    await expect(firstShow.locator('.box-fact')).toHaveText(pills === 1 ? '1 season' : pills + ' seasons');
    await expect(firstShow.locator('.box-fact svg')).toHaveCount(1);
    await expect(page.locator('#items .card.box.wide .box-fact')).toHaveCount(1);

    await section(page, 'Movies');
    await enterItems(page);
    await expect(page.locator('#items .focused .card-title')).toHaveText('Movie 25');
    await press(page, 'Enter');
    // The detail page has TMDB's answer once it shows the length.
    await expect(page.locator('#detail .dt-meta')).toContainText('1 h 52 min');
    await back(page);
    await section(page, 'Movies');
    await view(page, 'wide');
    const film = page.locator('#items .card.box.wide').first();
    await expect(film.locator('.box-fact')).toHaveText('1 h 52 min');
    await expect(film.locator('.box-fact svg')).toHaveCount(1);
});

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
