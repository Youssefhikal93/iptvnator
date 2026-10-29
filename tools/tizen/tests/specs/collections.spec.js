const path = require('node:path');
const { test, expect, boot, section, press, back, moveTo, enterItems, toolbar, openFirst } = require('./helpers');

// TMDB for the fake catalogue (Movie 1..25): Movies 1-3 are a trilogy with a
// fourth film the provider lacks, 4-5 a pair, 6 a collection the provider has
// only one film of, the rest belong to none.
const COLLECTION_OF = { 1: [900, 'Movie Trilogy Collection'], 2: [900, 'Movie Trilogy Collection'], 3: [900, 'Movie Trilogy Collection'], 4: [901, 'Pair Collection'], 5: [901, 'Pair Collection'], 6: [902, 'Lonely Collection'] };
const PARTS = {
    900: [[103, 'Movie 3', '2003'], [101, 'Movie 1', '2001'], [102, 'Movie 2', '2002'], [999, 'Movie Lost', '2004']],
    901: [[104, 'Movie 4', '2001'], [105, 'Movie 5', '2002']],
    902: [[106, 'Movie 6', '2001'], [998, 'Movie Gone', '2002']],
};
const NAMES = { 900: 'Movie Trilogy Collection', 901: 'Pair Collection', 902: 'Lonely Collection' };

// Every TMDB request as path?query, so a repeat is easy to see.
async function tmdb(page) {
    const asked = [];
    await page.route('https://image.tmdb.org/**', route => route.fulfill({ path: path.join(__dirname, '../media/poster.jpg'), contentType: 'image/jpeg' }));
    await page.route('https://api.themoviedb.org/**', route => {
        const url = new URL(route.request().url());
        url.searchParams.delete('api_key');
        const endpoint = url.pathname.replace('/3', '');
        asked.push(endpoint + '?' + url.searchParams.toString());
        const search = /^\/search\/movie$/.test(endpoint) && /^Movie (\d+)$/.exec(url.searchParams.get('query') || '');
        if (search) return route.fulfill({ json: { results: [{ id: 100 + Number(search[1]), title: 'Movie ' + search[1], release_date: '2021-03-14' }] } });
        const movie = /^\/movie\/(\d+)$/.exec(endpoint);
        if (movie) {
            const n = Number(movie[1]) - 100;
            const collection = COLLECTION_OF[n];
            return route.fulfill({ json: { id: Number(movie[1]), title: 'Movie ' + n, release_date: '2021-03-14', overview: 'A film.', poster_path: '/p.jpg',
                belongs_to_collection: collection ? { id: collection[0], name: collection[1] } : null, credits: { cast: [] }, videos: { results: [] }, similar: { results: [] } } });
        }
        const collection = /^\/collection\/(\d+)$/.exec(endpoint);
        if (collection && PARTS[collection[1]]) {
            return route.fulfill({ json: { id: Number(collection[1]), name: NAMES[collection[1]], poster_path: '/c.jpg',
                parts: PARTS[collection[1]].map(([id, title, year]) => ({ id, title, release_date: year + '-01-01', poster_path: '/p.jpg' })) } });
        }
        if (endpoint.startsWith('/genre/')) return route.fulfill({ json: { genres: [] } });
        return route.fulfill({ status: 404, json: { status_message: 'not found' } });
    });
    return asked;
}

const keyed = { storage: { settings: { tmdbApiKey: 'test-key' } } };
const lookups = asked => asked.filter(entry => /^\/(search\/movie|movie\/\d+|collection\/\d+)\?/.test(entry));
const labels = page => page.locator('#categories .row .label').allTextContents();

async function collectionsFound(page) {
    // The look-up runs while the remote rests: one film a second here.
    await expect.poll(async () => (await labels(page)).includes('Collections'), { timeout: 90_000 }).toBe(true);
    await expect.poll(() => page.locator('#categories .row').filter({ hasText: 'Collections' }).locator('.badge').innerText(), { timeout: 90_000 }).toBe('2');
    await expect.poll(() => page.evaluate(() => CollectionLookup.progress()), { timeout: 90_000 }).toBe(null);
}

async function openCollections(page) {
    await moveTo(page, '#categories .focused .label', 'Collections', 'ArrowUp');
    await expect(page.locator('#items .list-header')).toContainText('Collections');
}

// Storage reads while moving through a list, as in hide-watched.spec.js.
async function readsWhileMoving(page) {
    return page.evaluate(async () => {
        let reads = 0;
        const original = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key) { reads++; return original.call(this, key); };
        try {
            for (let i = 0; i < 40; i++) {
                const keyCode = i % 2 ? 37 : 39;
                document.dispatchEvent(new KeyboardEvent('keydown', { keyCode, which: keyCode, bubbles: true }));
                document.dispatchEvent(new KeyboardEvent('keyup', { keyCode, which: keyCode, bubbles: true }));
                await Promise.resolve();
            }
        } finally { Storage.prototype.getItem = original; }
        return reads;
    });
}

test('with a TMDB key the look-up fills Collections; each film is asked once and nothing again after a reload', async ({ page }) => {
    test.setTimeout(180_000);
    const asked = await tmdb(page);
    await boot(page, keyed);
    await section(page, 'Movies');
    await collectionsFound(page);
    // Right after Recently added, before the library rows.
    const shown = await labels(page);
    expect(shown.indexOf('Collections')).toBe(shown.indexOf('Recently added') + 1);
    const first = lookups(asked);
    // 25 films: one search and one details request each at most, three collections.
    expect(first.filter(entry => entry.startsWith('/search/movie')).length).toBeLessThanOrEqual(25);
    expect(first.filter(entry => entry.startsWith('/movie/')).length).toBeLessThanOrEqual(25);
    expect(first.filter(entry => entry.startsWith('/collection/')).length).toBe(3);
    expect(new Set(first).size).toBe(first.length);
    const keyedReads = await readsWhileMoving(page);

    await page.reload();
    await section(page, 'Movies');
    await expect.poll(async () => (await labels(page)).includes('Collections')).toBe(true);
    await page.waitForTimeout(5000);
    expect(lookups(asked)).toHaveLength(first.length);

    // Moving through a list costs the same storage reads as without a key.
    await page.evaluate(() => Prefs.set('tmdbApiKey', ''));
    await page.reload();
    await section(page, 'Movies');
    expect(await readsWhileMoving(page)).toBe(keyedReads);
});

test('a collection opens on its films in release order, a missing one greyed; the search bar filters names without TMDB', async ({ page }) => {
    test.setTimeout(180_000);
    const asked = await tmdb(page);
    await boot(page, keyed);
    await section(page, 'Movies');
    await collectionsFound(page);
    await openCollections(page);
    await expect(page.locator('#items .card-title')).toHaveText(['Movie Trilogy Collection', 'Pair Collection']);
    await expect(page.locator('#items .card-sub')).toHaveText(['4 films · 3 available', '2 films · 2 available']);
    const before = lookups(asked).length;
    await enterItems(page);
    await press(page, 'Enter');
    await expect(page.locator('#items .list-header')).toContainText('Movie Trilogy Collection');
    await expect(page.locator('#items .list-header')).toContainText('4 films · 3 available');
    await expect(page.locator('#items .card-title')).toHaveText(['Movie 1', 'Movie 2', 'Movie 3', 'Movie Lost']);
    await expect(page.locator('#items .card').nth(3).locator('.cl-tag')).toHaveText('Not available');
    await expect(page.locator('#items .card').nth(0).locator('.cl-tag')).toHaveCount(0);
    await back(page);
    await expect(page.locator('#items .card-title')).toHaveText(['Movie Trilogy Collection', 'Pair Collection']);
    // The top bar finds collections by name.
    await toolbar(page, 'search');
    await press(page, 'Enter');
    await page.keyboard.type('pair');
    await press(page, 'Enter');
    await expect(page.locator('#items .card-title')).toHaveText(['Pair Collection']);
    expect(lookups(asked)).toHaveLength(before);
});

test('a film\'s detail page shows its collection first: This film, Not available and the count', async ({ page }) => {
    test.setTimeout(180_000);
    await tmdb(page);
    await boot(page, keyed);
    await section(page, 'Movies');
    await moveTo(page, '#categories .focused .label', 'All movies', 'ArrowUp');
    await enterItems(page);
    await moveTo(page, '#items .card.focused .card-title', 'Movie 2', 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#detail')).toBeVisible();
    const row = page.locator('#detail .dt-rows .tm-row').first();
    await expect(row).toHaveClass(/collection/);
    await expect(row.locator('h2')).toHaveText('Movie Trilogy Collection');
    await expect(row.locator('.tm-aside')).toHaveText('4 films · 3 available');
    await expect(row.locator('.tm-card > span')).toHaveText(['Movie 1', 'Movie 2', 'Movie 3', 'Movie Lost']);
    await expect(row.locator('.tm-card').nth(1).locator('.cl-tag')).toHaveText('This film');
    await expect(row.locator('.tm-card').nth(3)).toHaveClass(/missing/);
    // ▼ reaches the row; OK on another part opens that film.
    await press(page, 'ArrowDown');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#detail .dt-title')).toContainText('Movie 3');
});

test('without a key collections come from the film names and TMDB is never asked', async ({ page }) => {
    const asked = await tmdb(page);
    const films = ['Toy Story', 'Toy Story 2', 'Toy Story 3', 'The Godfather', 'The Godfather Part II', 'Heat', 'Inception'];
    await page.route('**/player_api.php*', async route => {
        const action = new URL(route.request().url()).searchParams.get('action');
        if (action !== 'get_vod_streams') return route.continue();
        await route.fulfill({ json: films.map((name, i) => ({ name, stream_id: 2100 + i, category_id: '1', container_extension: 'mkv', added: String(1700000000 + i) })) });
    });
    await boot(page);
    await section(page, 'Movies');
    await expect.poll(async () => (await labels(page)).includes('Collections')).toBe(true);
    await openCollections(page);
    await expect(page.locator('#items .card-title')).toHaveText(['The Godfather', 'Toy Story']);
    await expect(page.locator('#items .card-sub')).toHaveText(['2 films', '3 films']);
    await enterItems(page);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#items .card-title')).toHaveText(['Toy Story', 'Toy Story 2', 'Toy Story 3']);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#detail')).toBeVisible();
    const row = page.locator('#detail .dt-rows .tm-row').first();
    await expect(row.locator('h2')).toHaveText('Toy Story collection');
    await expect(row.locator('.tm-card').nth(1).locator('.cl-tag')).toHaveText('This film');
    await page.waitForTimeout(500);
    expect(asked).toHaveLength(0);
});
