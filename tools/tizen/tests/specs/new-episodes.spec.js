const { test, expect, boot, show, section, category, enterItems, press, back, playing } = require('./helpers');

// The fake server dates Show 4 at 1700028800 s. The viewer last watched it earlier.
const WATCHED = 1700000000000;

function watchedSeed() {
    const entry = {
        name: 'Show 4', series_id: 3004,
        episode: { id: 4001, container_extension: 'mp4', label: 'S1 E1  Pilot 1' },
        show: { name: 'Show 4', series_id: 3004 },
        label: 'Show 4 · S1 E1 Pilot 1',
    };
    return { storage: {
        'favorites:s1': { series: [show(4)] },
        'recent:s1': { series: [entry] },
        progress: { 'episode:4001': { position: 200, duration: 400, updatedAt: WATCHED } },
    } };
}

// The badge on the poster in the New episodes row (favorite series repeat it further down).
const newBadge = page => page.locator('.hm-row').filter({ has: page.locator('h2', { hasText: 'New episodes' }) }).locator('.new-badge');
const newRow = page => page.locator('.hm-row > h2', { hasText: 'New episodes' });

async function openFromHome(page) {
    const focused = page.locator('.hm-row').filter({ has: page.locator('h2', { hasText: 'New episodes' }) }).locator('.hm-card.focus');
    for (let i = 0; i < 6 && !await focused.count(); i++) await press(page, 'ArrowDown');
    await expect(focused.locator('.new-badge')).toHaveText('New episodes');
    await press(page, 'Enter');
    await expect(page.locator('#detail')).toBeVisible();
    await expect(page.locator('#detail .dt-meta')).not.toContainText('Loading');
}

test('new episodes badge and Home row appear for a show added to since it was watched, and clear when it is opened', async ({ page }) => {
    await boot(page, watchedSeed());
    await expect(newRow(page)).toBeVisible();
    await expect(newBadge(page)).toHaveText('New episodes');
    await section(page, 'Series');
    // The default category lists every fake show; only the watched one is badged.
    await expect(page.locator('#items .card-title').first()).toHaveText('Show 4');
    await expect(page.locator('#items .new-badge')).toHaveCount(1);
    await expect(page.locator('#items .card').first().locator('.new-badge')).toHaveText('New episodes');
    await category(page, 'Favorites');
    await expect(page.locator('#items .new-badge')).toHaveCount(1);
    await category(page, 'Recently watched');
    await expect(page.locator('#items .new-badge')).toHaveCount(1);
    await section(page, 'Home');
    await openFromHome(page);
    // The page it was opened for still names the new episodes (#46).
    await expect(page.locator('#detail .dt-chip.badge')).toHaveText('New episodes');
    await back(page);
    await expect(page.locator('#detail')).toBeHidden();
    await expect(newRow(page)).toHaveCount(0);
    await expect(page.locator('.new-badge')).toHaveCount(0);
    await section(page, 'Series');
    await expect(page.locator('#items .new-badge')).toHaveCount(0);
    // Cleared for good: still gone after a restart.
    await page.reload();
    await expect(page.locator('.hm-eyebrow')).toContainText('Continue watching');
    await expect(newRow(page)).toHaveCount(0);
});

test('a never-watched favorite and movies get no badge', async ({ page }) => {
    const seed = watchedSeed();
    seed.storage['favorites:s1'].series.push(show(6));
    await boot(page, seed);
    await section(page, 'Series');
    await category(page, 'Favorites');
    await expect(page.locator('#items .card')).toHaveCount(2);
    await expect(page.locator('#items .new-badge')).toHaveCount(1);
    await expect(page.locator('#items .card').filter({ hasText: 'Show 6' }).locator('.new-badge')).toHaveCount(0);
    await section(page, 'Movies');
    await expect(page.locator('#items .new-badge')).toHaveCount(0);
});

test('a catalogue refresh that adds episodes brings the badge back on Home and in lists', async ({ page }) => {
    await boot(page, watchedSeed());
    await expect(newRow(page)).toBeVisible();
    await section(page, 'Series');
    await category(page, 'Favorites');
    await enterItems(page);
    await press(page, 'Enter');
    await expect(page.locator('#detail')).toBeVisible();
    await expect(page.locator('#detail .dt-meta')).not.toContainText('Loading');
    await back(page);
    await expect(page.locator('#items .new-badge')).toHaveCount(0);

    // After the restart the saved list shows first; the refresh then dates Show 4 later than now.
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let asked;
    const requested = new Promise(resolve => { asked = resolve; });
    await page.route(url => url.pathname === '/player_api.php' && url.searchParams.get('action') === 'get_series', async route => {
        asked();
        await gate;
        const response = await route.fetch();
        const list = await response.json();
        for (const item of list) if (item.series_id === 3004) item.last_modified = String(Math.floor(Date.now() / 1000) + 100000);
        await route.fulfill({ response, json: list });
    });
    await page.reload();
    await requested;
    await page.waitForTimeout(300);
    await expect(newRow(page)).toHaveCount(0);
    release();
    await expect(newRow(page)).toBeVisible();
    await expect(newBadge(page)).toHaveText('New episodes');
    await section(page, 'Series');
    await category(page, 'Favorites');
    await expect(page.locator('#items .new-badge')).toHaveCount(1);
    await enterItems(page);
    await press(page, 'Enter');
    await expect(page.locator('#detail')).toBeVisible();
    await back(page);
    await expect(page.locator('#items .new-badge')).toHaveCount(0);
});

test('resuming an episode of the show clears the badge too', async ({ page }) => {
    await boot(page, watchedSeed());
    await expect(newRow(page)).toBeVisible();
    const seen = () => page.evaluate(() => JSON.parse(localStorage.getItem('iptvnator-tv:p:default:seen:s1') || '{}')['3004'] || 0);
    expect(await seen()).toBe(0);
    await press(page, 'Enter'); // the hero's Continue watching button
    await playing(page);
    expect(await seen()).toBeGreaterThan(WATCHED);
    await expect(page.locator('#pl-controls')).toBeHidden({ timeout: 10000 });
    await back(page);
    await expect(page.locator('#player')).toBeHidden();
    await expect(newRow(page)).toHaveCount(0);
});
