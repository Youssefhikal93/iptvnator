const { test, expect, boot, section, enterItems, press, back, playing, setting, choose } = require('./helpers');

// The fake clock starts on a Wednesday at 10:00 (local), after the night's 02:00.
const NOW = new Date('2026-03-04T10:00:00').getTime();
const DAY = 24 * 3600000;
const origin = 'http://localhost:' + (process.env.TV_TEST_PORT || 8767);
const first = { id: 's1', type: 'xtream', name: 'Regression TV', url: origin, user: 'tester', pass: 'secret' };
const other = { id: 's2', type: 'xtream', name: 'Other TV', url: origin, user: 'other', pass: 'secret' };

// s1 was refreshed this morning; s2 two days ago (or never, with stale: false).
async function start(page, { second = other, settings = {}, storage = {} } = {}) {
    await page.clock.install({ time: NOW });
    await boot(page, { autoRefresh: true, storage: {
        sources: [first, second],
        'refreshed:s1': { at: NOW - 3600000 },
        'refreshed:s2': { at: NOW - 2 * DAY },
        settings: { onStart: 'home', ...settings },
        ...storage,
    } });
}

// Every call to the second account's API, in order; the app's own are not counted.
function watch(page, user = 'other') {
    const calls = { list: [] };
    page.on('request', req => {
        const url = new URL(req.url());
        if (url.pathname === '/player_api.php' && url.searchParams.get('username') === user && url.searchParams.get('action')) {
            calls.list.push(url.searchParams.get('action'));
        }
    });
    return calls;
}

const idle = (page, ms = 61000) => page.clock.fastForward(ms);
const stored = (page, key) => page.evaluate(key => JSON.parse(localStorage.getItem('iptvnator-tv:' + key)), key);

test('an old source is fetched again in the background, one request at a time, and shows when', async ({ page }) => {
    let open = 0;
    let most = 0;
    // Every request of the second account is held back a moment, so two at once would overlap.
    await page.route('**/player_api.php?*username=other*', async route => {
        most = Math.max(most, ++open);
        await new Promise(resolve => setTimeout(resolve, 150));
        const response = await route.fetch();
        open--;
        await route.fulfill({ response });
    });
    await start(page);
    const calls = watch(page);
    // A minute idle, then one source is fetched; the fresh one is left alone.
    await idle(page);
    await expect.poll(async () => (await stored(page, 'refreshed:s2')).at).toBeGreaterThan(NOW);
    expect(calls.list).toContain('get_live_categories');
    expect(calls.list).toContain('get_live_streams');
    expect(calls.list).toContain('get_vod_streams');
    expect(calls.list).toContain('get_series');
    expect(most).toBe(1);
    expect((await stored(page, 'refreshed:s1')).at).toBe(NOW - 3600000);
    expect((await page.evaluate(() => Promise.resolve(Catalogue.get('s2', 'live:categories')))).length).toBeGreaterThan(1);
    // Nothing more is due: no further request for the same account.
    const done = calls.list.length;
    await idle(page);
    await page.waitForTimeout(300);
    expect(calls.list.length).toBe(done);
    // Settings shows when, on the source and not on the one refreshed an hour ago.
    await section(page, 'Settings');
    await expect(page.locator('#settings .st-source').filter({ hasText: 'Other TV' })).toContainText('Last refreshed Mar 4 10:01');
    await expect(page.locator('#settings .st-source').filter({ hasText: 'Regression TV' })).toContainText('Last refreshed Mar 4 09:00');
    // Opening Settings checks each account; its held request may still be in flight.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('a source with a guide link refreshes its guide after its lists, one at a time', async ({ page }) => {
    let downloads = 0;
    page.on('request', req => { if (new URL(req.url()).pathname === '/epg.xml.gz') downloads++; });
    await start(page, {
        second: { ...other, epgUrl: origin + '/epg.xml.gz' },
        storage: { 'guide:s2': { updatedAt: NOW - 2 * DAY, state: 'ready' } },
    });
    await idle(page);
    await expect.poll(async () => (await stored(page, 'refreshed:s2')).at).toBeGreaterThan(NOW);
    expect(downloads).toBe(0);
    await idle(page);
    await expect.poll(() => downloads).toBe(1);
    await expect.poll(async () => (await stored(page, 'guide:s2')).updatedAt).toBeGreaterThan(NOW);
});

test('nothing is fetched while a channel plays; the refresh follows once playback has ended', async ({ page }) => {
    await start(page);
    const calls = watch(page);
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await idle(page);
    await idle(page);
    await idle(page);
    await page.waitForTimeout(400);
    expect(calls.list).toEqual([]);
    expect((await stored(page, 'refreshed:s2')).at).toBe(NOW - 2 * DAY);
    await back(page);
    await expect(page.locator('#player')).toBeHidden();
    // The key press that ended playback restarts the minute of idleness.
    await idle(page, 30000);
    await page.waitForTimeout(300);
    expect(calls.list).toEqual([]);
    await idle(page);
    await expect.poll(() => calls.list.length).toBeGreaterThan(0);
    await expect.poll(async () => (await stored(page, 'refreshed:s2')).at).toBeGreaterThan(NOW);
});

test('a failed refresh shows no error and is tried again an hour later', async ({ page }) => {
    // Every request counts here: the account check comes first and fails, so no list is asked.
    let asked = 0;
    await page.route('**/player_api.php?*username=other*', route => { asked++; return route.fulfill({ status: 503, body: 'down' }); });
    await start(page);
    const calls = { get list() { return { length: asked }; } };
    await idle(page);
    await expect.poll(async () => (await stored(page, 'refreshed:s2')).tried).toBeGreaterThan(NOW);
    expect((await stored(page, 'refreshed:s2')).at).toBe(NOW - 2 * DAY);
    const tries = calls.list.length;
    expect(tries).toBeGreaterThan(0);
    await expect(page.locator('#toast')).toBeHidden();
    await expect(page.locator('.error, #pl-status.error')).toHaveCount(0);
    // Half an hour on: still waiting. An hour after the failure: tried again.
    await idle(page, 30 * 60000);
    await page.waitForTimeout(300);
    expect(calls.list.length).toBe(tries);
    await idle(page, 31 * 60000);
    await expect.poll(() => calls.list.length).toBeGreaterThan(tries);
    await expect(page.locator('#toast')).toBeHidden();
});

test('Refresh automatically is Daily at night by default and Off stops the background refresh', async ({ page }) => {
    await start(page);
    const calls = watch(page);
    await setting(page, 'Refresh automatically');
    await expect(page.locator('#settings .st-row.focused')).toContainText('Daily at night');
    await choose(page, 'Off');
    await expect(page.locator('#settings .st-row.focused')).toContainText('Off');
    await idle(page);
    await idle(page);
    await page.waitForTimeout(400);
    expect(calls.list).toEqual([]);
    // Every 12 hours is a choice too, and one that refreshes.
    await choose(page, 'Every 12 hours');
    await idle(page);
    await expect.poll(() => calls.list.length).toBeGreaterThan(0);
});

test('a source never refreshed says so', async ({ page }) => {
    await start(page, { storage: { 'refreshed:s2': null } });
    await section(page, 'Settings');
    await expect(page.locator('#settings .st-source').filter({ hasText: 'Other TV' })).toContainText('Not refreshed yet');
});
