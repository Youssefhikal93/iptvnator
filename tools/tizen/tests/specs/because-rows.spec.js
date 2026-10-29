const path = require('node:path');
const { test, expect, boot, movie, show, press, back, moveTo } = require('./helpers');

// TMDB knows Movie 25 and Show 4, each with similar titles the fake provider has
// (and one it does not), in an order unlike the catalogue's.
const similarMovies = [7, 3, 12, 99, 1, 5, 9].map((n) => ({ id: 100 + n, title: 'Movie ' + n }));
const similarShows = [2, 9, 1, 3, 98, 5].map((n) => ({ id: 200 + n, name: 'Show ' + n }));

async function tmdb(page) {
    const seen = [];
    await page.route('https://image.tmdb.org/**', (route) => route.fulfill({ path: path.join(__dirname, '../media/poster.jpg'), contentType: 'image/jpeg' }));
    await page.route('https://api.themoviedb.org/**', (route) => {
        const url = new URL(route.request().url());
        const endpoint = url.pathname.replace('/3', '');
        seen.push(endpoint);
        const query = url.searchParams.get('query');
        if (endpoint === '/search/movie') return route.fulfill({ json: { results: query === 'Movie 25' ? [{ id: 25, title: 'Movie 25' }] : [] } });
        if (endpoint === '/search/tv') return route.fulfill({ json: { results: query === 'Show 4' ? [{ id: 4, name: 'Show 4' }] : [] } });
        if (endpoint === '/movie/25') return route.fulfill({ json: { id: 25, title: 'Movie 25', overview: 'A plot.', similar: { results: similarMovies } } });
        if (endpoint === '/tv/4') return route.fulfill({ json: { id: 4, name: 'Show 4', overview: 'A plot.', similar: { results: similarShows } } });
        return route.fulfill({ status: 404, json: { status_message: 'Not found' } });
    });
    return seen;
}

function seed(storage = {}) {
    return { storage: {
        settings: { tmdbApiKey: 'test-key' },
        progress: { 'movie:2025': { position: 310, duration: 4000, updatedAt: 100 }, 'episode:9': { position: 600, duration: 2400, updatedAt: 50 } },
        'recent:s1': {
            movies: [movie(25)],
            series: [{ ...show(4), show: show(4), episode: { id: 9, container_extension: 'mp4', label: 'S1 E1' }, label: 'Show 4 · S1 E1' }],
        },
        ...storage,
    } };
}

const titles = (page) => page.locator('.hm-row > h2').allTextContents();

// Moves down Home and collects every row title on the way.
async function rowTitles(page) {
    const seen = [];
    for (let i = 0; i < 12; i++) {
        for (const title of await titles(page)) if (!seen.includes(title)) seen.push(title);
        await press(page, 'ArrowDown');
    }
    return seen;
}

test('after a movie is watched, Home shows titles like it that the provider has, without asking TMDB on Home', async ({ page }) => {
    const seen = await tmdb(page);
    await boot(page, seed());
    await expect(page.locator('.hm-hero-title')).toHaveText('Movie 25');
    // Home itself never asks TMDB, and has no row before the title is watched.
    await page.waitForTimeout(500);
    expect(seen).toHaveLength(0);
    await expect(page.locator('.hm-pill')).toHaveCount(0);
    await press(page, 'Enter');
    await expect(page.locator('#player')).toBeVisible();
    await page.waitForTimeout(1500);
    for (let i = 0; i < 6 && await page.locator('#player').isVisible(); i++) await back(page);
    await expect(page.locator('#player')).toBeHidden();
    await expect.poll(() => seen.includes('/movie/25')).toBe(true);
    const row = page.locator('.hm-row').filter({ hasText: 'Because you watched Movie 25' });
    for (let i = 0; i < 10 && !await row.count(); i++) await press(page, 'ArrowDown');
    await expect(row.locator('.hm-pill')).toHaveText('Movie');
    // TMDB's order, only the provider's titles, never Movie 25 itself.
    await expect(row.locator('.hm-card > span')).toHaveText(['Movie 7', 'Movie 3', 'Movie 12', 'Movie 1', 'Movie 5', 'Movie 9']);
    // OK opens the title like any other row.
    await moveTo(page, '.hm-card.focus > span', 'Movie 7', 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#detail')).toContainText('Movie 7');
    await back(page);
    // After a reload the saved list is used: moving through Home asks TMDB nothing.
    await page.reload();
    await expect(page.locator('.hm-hero-title')).toHaveText('Movie 25');
    seen.length = 0;
    const order = await rowTitles(page);
    expect(seen).toHaveLength(0);
    const because = order.findIndex((title) => title.startsWith('Because you watched Movie 25'));
    expect(because).toBeGreaterThan(order.indexOf('Continue watching'));
    expect(because).toBeLessThan(order.indexOf('Recently added movies'));
});

test('a show opened from Home gives a TV show row; without a TMDB key there are no rows', async ({ page }) => {
    await tmdb(page);
    const watching = seed();
    watching.storage.progress['episode:9'].updatedAt = 200;
    await boot(page, watching);
    // Details of the show being watched, from the hero.
    await expect(page.locator('.hm-hero-title')).toHaveText('Show 4');
    await moveTo(page, '.hm-hero-buttons .focus', 'Details', 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#detail')).toContainText('Show 4');
    await expect(page.locator('#detail')).toContainText('Show 9');
    await back(page);
    const row = page.locator('.hm-row').filter({ hasText: 'Because you watched Show 4' });
    for (let i = 0; i < 10 && !await row.count(); i++) await press(page, 'ArrowDown');
    await expect(row.locator('.hm-pill')).toHaveText('TV show');
    await expect(row.locator('.hm-card > span')).toHaveText(['Show 2', 'Show 9', 'Show 1', 'Show 3', 'Show 5']);
    // Saved per profile and source, keyed by the show.
    expect(Object.keys(await page.evaluate(() => JSON.parse(localStorage.getItem('iptvnator-tv:p:default:because:s1'))))).toEqual(['series:3004']);
    // Remove the key (shared by profiles): the saved list stays, but no row
    // shows and nothing fails.
    await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            if (!value || value.indexOf('tmdbApiKey') === -1) continue;
            const record = JSON.parse(value);
            delete record.tmdbApiKey;
            localStorage.setItem(key, JSON.stringify(record));
        }
    });
    await page.reload();
    await expect(page.locator('.hm-hero-title')).toBeVisible();
    expect((await rowTitles(page)).filter((title) => title.startsWith('Because'))).toHaveLength(0);
});

test('a row built while the parental lock was open goes when it locks again', async ({ page }) => {
    await tmdb(page);
    await boot(page, seed());
    await page.clock.install();
    await expect(page.locator('.hm-hero-title')).toHaveText('Movie 25');
    await press(page, 'Enter');
    await expect(page.locator('#player')).toBeVisible();
    await page.waitForTimeout(1500);
    for (let i = 0; i < 6 && await page.locator('#player').isVisible(); i++) await back(page);
    await expect(page.locator('#player')).toBeHidden();
    const row = page.locator('.hm-row').filter({ hasText: 'Because you watched Movie 25' });
    for (let i = 0; i < 10 && !await row.count(); i++) await press(page, 'ArrowDown');
    await expect(row).toHaveCount(1);
    // Every movie category locked, and opened with the PIN: the row stays.
    await page.evaluate(() => {
        ParentalLock.setPin('1234');
        for (let id = 1; id <= 40; id++) ParentalLock.lock('s1', 'movies', String(id));
        ParentalLock.unlock('1234');
    });
    await expect(row).toHaveCount(1);
    // The lock closes again after 15 minutes: the row and its titles go.
    await page.clock.fastForward(900001);
    await expect(row).toHaveCount(0);
});
