const { test, expect, boot, section, press, moveTo, back, openFirst } = require('./helpers');
const fixture = require('../fixtures/backup/desktop-backup.json');

async function backupRow(page, label) {
    await section(page, 'Settings');
    await moveTo(page, '.st-row.focused .st-label', label);
    await press(page, 'Enter');
    await expect(page.locator('#backup-screen')).toBeVisible();
}

async function importFixture(page, payload) {
    const origin = new URL(page.url()).origin;
    const manifest = payload || JSON.parse(JSON.stringify(fixture));
    if (manifest.playlists) {
        manifest.playlists.filter(entry => entry.portalType === 'xtream').forEach(entry => { entry.connection.serverUrl = origin; });
    }
    await page.route(origin + '/desktop-backup.json', route => route.fulfill({ json: manifest }));
    await backupRow(page, 'Import from link…');
    await page.locator('#backup-url').fill(origin + '/desktop-backup.json');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
}

test('Replace previews counts with Cancel focused, then restores sources, favorites and a playable resume position', async ({ page }) => {
    await boot(page);
    await importFixture(page);
    await expect(page.locator('#backup-screen')).toContainText('3 sources, 4 favorites, 3 watch positions');
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await expect(page.locator('#backup-screen')).not.toContainText('fake-password');
    await expect(page.locator('#backup-screen')).not.toContainText('fake-viewer');
    await press(page, 'ArrowLeft');
    await press(page, 'ArrowLeft');
    await press(page, 'Enter');
    await expect(page.locator('#source-name')).toHaveText('Desktop TV');
    const restored = await page.evaluate(() => ({
        sources: Sources.all().length,
        favorites: Library.favorites(Sources.current().id, 'movies').length,
        position: Progress.resumeFrom('movie:2025', 6730),
        watched: Progress.isWatched('movie:2026'),
    }));
    expect(restored).toEqual({ sources: 3, favorites: 1, position: 200, watched: true });
    const m3u = await page.evaluate(async () => {
        const source = Sources.all().find(source => source.type === 'm3u');
        const cached = await Catalogue.get(source.id, 'backup:m3u');
        const exported = await Backup.build();
        return { cached: cached.text, exported: exported.playlists.find(entry => entry.portalType === 'm3u').source.rawM3u };
    });
    expect(m3u.cached).toBe(fixture.playlists[2].source.rawM3u);
    expect(m3u.exported).toBe(m3u.cached);
    await openFirst(page, 'Movies');
    await expect(page.locator('#detail')).toContainText('Resume');
});

test('Merge keeps an existing source and library, adds missing sources, and retains a newer smaller position', async ({ page }) => {
    await boot(page, { storage: {
        'favorites:s1': { movies: [{ stream_id: 2001, name: 'Kept favorite' }] },
        progress: { 'movie:2025': { position: 60, duration: 6730, updatedAt: Date.parse('2026-10-27') } },
    } });
    const manifest = JSON.parse(JSON.stringify(fixture));
    manifest.playlists[0].connection.username = 'tester';
    await importFixture(page, manifest);
    await expect(page.locator('#backup-screen')).toContainText('3 sources, 4 favorites, 3 watch positions');
    await press(page, 'ArrowLeft');
    await press(page, 'Enter');
    await expect(page.locator('#backup-screen')).toHaveCount(0);
    await expect(page.locator('#source-name')).toHaveText('Regression TV');
    const restored = await page.evaluate(() => ({
        sources: Sources.all().length,
        favorites: Library.favorites('s1', 'movies').map(item => item.stream_id).sort(),
        position: Progress.of('movie:2025').position,
        password: Sources.current().pass,
    }));
    expect(restored).toEqual({ sources: 3, favorites: [2001, 2025], position: 60, password: 'secret' });
});

test('invalid files show a clear error and leave sources, favorites and progress untouched', async ({ page }) => {
    await boot(page);
    const before = await page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
    await importFixture(page, { kind: 'iptvnator-playlist-backup', version: 900, playlists: [] });
    await expect(page.locator('#backup-screen')).toContainText('Invalid or unsupported backup file');
    expect(await page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)))).toBe(before);
    await back(page);
    await expect(page.locator('#backup-screen')).toHaveCount(0);
    await expect(page.locator('.st-row.focused .st-label')).toHaveText('Import from link…');
});

test('Cancel and Return during import leave saved data unchanged and ignore a late response', async ({ page }) => {
    await boot(page);
    await importFixture(page);
    await expect(page.locator('#backup-screen')).toContainText('3 sources');
    await press(page, 'Enter');
    await expect(page.locator('#backup-screen')).toHaveCount(0);
    expect(await page.evaluate(() => Sources.all().length)).toBe(1);
    let release;
    const delayed = new Promise(resolve => { release = resolve; });
    const origin = new URL(page.url()).origin;
    await page.route(origin + '/slow-backup.json', async route => { await delayed; await route.fulfill({ json: fixture }); });
    await backupRow(page, 'Import from link…');
    await page.locator('#backup-url').fill(origin + '/slow-backup.json');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#backup-screen')).toContainText('Downloading');
    await back(page);
    release();
    await expect(page.locator('#backup-screen')).toHaveCount(0);
    expect(await page.evaluate(() => Sources.all().length)).toBe(1);
});

test('Export warns before building, provides an in-memory download and verifies a self-hosted phone link', async ({ page }) => {
    await boot(page);
    await page.evaluate(async () => {
        await Catalogue.put('s1', 'movies:items:1', [{ stream_id: 2007, name: 'Marked without a recent view' }]);
        await Catalogue.put('s1', 'series:3004', { episodes: [{ id: 4002, season: '1', num: '2' }] });
        Progress.mark(['movie:2007', 'episode:4002'], true, [600, 2400]);
    });
    await backupRow(page, 'Export');
    await expect(page.locator('#backup-screen')).toContainText('Contains your passwords');
    await expect(page.locator('#backup-screen a')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await press(page, 'ArrowLeft');
    await press(page, 'Enter');
    await expect(page.locator('#backup-screen')).toContainText('QR code unavailable');
    await expect(page.locator('#backup-screen a')).toHaveAttribute('href', /^blob:/);
    await press(page, 'ArrowLeft');
    await press(page, 'Enter');
    await expect(page.locator('#backup-screen')).toContainText('Contains your passwords');
    const endpoint = new URL('/saved-backup.json', page.url());
    endpoint.hostname = 'backup.lan';
    const url = endpoint.href;
    let received;
    await page.route(url, async route => {
        if (route.request().method() === 'PUT') received = JSON.parse(route.request().postData());
        await route.fulfill({ json: received || {}, headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    await page.locator('#backup-url').fill(url);
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#backup-screen')).toContainText('Open this verified link on your phone:');
    await expect(page.locator('#backup-screen')).toContainText(url);
    expect(received.kind).toBe(fixture.kind);
    expect(received.playlists[0].connection.password).toBe('secret');
    const positions = received.playlists[0].userState.playbackPositions;
    expect(positions.find(position => position.contentXtreamId === 2007).positionSeconds).toBe(600);
    expect(positions.find(position => position.contentXtreamId === 4002)).toMatchObject({ seriesXtreamId: 3004, seasonNumber: 1, episodeNumber: 2, positionSeconds: 2400 });
});

test('large Export shows its size and offers Copy to a link without pretending to host a phone URL', async ({ page }) => {
    const favorites = Array.from({ length: 50 }, (_, i) => ({ stream_id: 2000 + i, name: 'Saved movie ' + i }));
    await boot(page, { storage: { 'favorites:s1': { movies: favorites } } });
    await backupRow(page, 'Export');
    await press(page, 'ArrowLeft');
    await press(page, 'Enter');
    await expect(page.locator('#backup-screen')).toContainText(/Too big for a QR code: \d+\.\d KB/);
    await expect(page.getByRole('button', { name: 'Copy to a link…', exact: true })).toBeVisible();
    await expect(page.locator('#backup-screen')).toContainText('no local file server');
});

test('POST export accepted by a local-only endpoint does not claim a reachable phone link', async ({ page }) => {
    await boot(page);
    await backupRow(page, 'Export');
    await press(page, 'ArrowLeft');
    await press(page, 'Enter');
    await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeFocused();
    await press(page, 'ArrowLeft');
    await press(page, 'Enter');
    const endpoint = new URL('/private-upload.json', page.url()).href;
    let uploaded;
    await page.route(endpoint, async route => {
        if (route.request().method() === 'POST') uploaded = JSON.parse(route.request().postData());
        await route.fulfill({ status: 201, body: '' });
    });
    await page.locator('#backup-url').fill(endpoint);
    await press(page, 'ArrowDown');
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#backup-screen')).toContainText('no readable phone link could be verified');
    await expect(page.locator('#backup-screen')).not.toContainText(endpoint);
    expect(uploaded.kind).toBe(fixture.kind);
});
