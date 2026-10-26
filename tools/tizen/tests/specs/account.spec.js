const { test, expect, boot, section, moveTo, press, enterItems, holdOK, menuChoice } = require('./helpers');

const DAY = 86400000;
const seconds = days => String(Math.floor((Date.now() + days * DAY) / 1000));
const accountUser = (request) => new URL(request.url()).searchParams.get('username');
const isAccountCall = (request) => !new URL(request.url()).searchParams.get('action');

// Answers the account check (player_api.php without an action) per username.
async function answerAccounts(page, answer) {
    await page.route('**/player_api.php?**', async route => {
        const request = route.request();
        if (!isAccountCall(request)) return route.continue();
        const reply = answer(accountUser(request));
        if (!reply) return route.continue();
        if (reply.http) return route.fulfill({ status: reply.http, body: 'down' });
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user_info: reply }) });
    });
}

const info = extra => ({ auth: 1, status: 'Active', exp_date: seconds(90), active_cons: '0', max_connections: '1', ...extra });

async function openSources(page) {
    await section(page, 'Sources');
    await expect(page.locator('#categories .row').first()).toBeVisible();
}

test('an account that ends within seven days warns on start and shows its details', async ({ page }) => {
    await answerAccounts(page, () => info({ exp_date: seconds(3), active_cons: '1', max_connections: '2', allowed_output_formats: ['m3u8', 'ts'] }));
    await boot(page);
    await expect(page.locator('#toast')).toContainText('Account expires in 3 days');
    await section(page, 'Live TV');
    await openSources(page);
    const row = page.locator('#categories .row').first();
    await expect(row).toContainText('Active');
    await expect(row).toContainText('Expires in 3 days');
    // Channels come from the saved catalogue of the Live TV visit above.
    await expect(row).toContainText('500 channels');
    await expect(row.locator('.badge')).toHaveText('Xtream');
    await expect(page.locator('#items')).toContainText('Status: Active');
    await expect(page.locator('#items')).toContainText('Connections: 1 / 2');
    await expect(page.locator('#items')).toContainText('Formats: m3u8, ts');
});

test('a far-off expiry shows no warning', async ({ page }) => {
    await boot(page);
    await openSources(page);
    await expect(page.locator('#toast')).toBeHidden();
    await expect(page.locator('#categories .row').first()).toContainText('Expires ');
    await expect(page.locator('#categories .row').first()).not.toContainText('Expires in');
});

const failures = [
    { name: 'expired', reply: () => info({ status: 'Expired', exp_date: seconds(-3) }), message: 'Account expired', hint: /expired on/, chip: 'Expired' },
    { name: 'expired by date', reply: () => info({ exp_date: seconds(-3) }), message: 'Account expired', hint: /expired on/, chip: 'Expired' },
    { name: 'inactive', reply: () => info({ status: 'Disabled' }), message: 'Account inactive', hint: /as disabled/, chip: 'Inactive' },
    { name: 'wrong login', reply: () => ({ auth: 0 }), message: 'Wrong login', hint: /username and password/, chip: 'Login failed' },
];

for (const failure of failures) {
    test('the ' + failure.name + ' account gets its own screen with a way back to Sources', async ({ page }) => {
        await answerAccounts(page, failure.reply);
        await boot(page);
        await expect(page.locator('#load-error')).toBeVisible();
        await expect(page.locator('#load-message')).toHaveText(failure.message);
        await expect(page.locator('#load-hint')).toHaveText(failure.hint);
        if (failure.name === 'expired') {
            const date = await page.evaluate(ms => new Date(ms).toLocaleDateString(), Number(failure.reply().exp_date) * 1000);
            await expect(page.locator('#load-hint')).toContainText(date);
        }
        await expect(page.locator('#load-retry')).toBeFocused();
        await press(page, 'ArrowRight');
        await expect(page.locator('#load-sources')).toBeFocused();
        // The countdown re-renders the screen; the choice must stay put.
        await page.waitForTimeout(1500);
        await expect(page.locator('#load-sources')).toBeFocused();
        await press(page, 'ArrowLeft');
        await expect(page.locator('#load-retry')).toBeFocused();
        await press(page, 'ArrowRight');
        await press(page, 'Enter');
        await expect(page.locator('#load-error')).toBeHidden();
        await expect(page.locator('#rail .active')).toHaveText('Sources');
        await expect(page.locator('#categories .row').first()).toContainText('Regression TV');
        await expect(page.locator('#categories .row').first().locator('.badge')).toHaveText(failure.chip);
        await expect(page.locator('#categories .row').first().locator('.badge')).toHaveClass(/warn/);
    });
}

test('the source in use recovers on Retry once the provider renews the account', async ({ page }) => {
    let renewed = false;
    await answerAccounts(page, () => renewed ? null : info({ status: 'Expired', exp_date: seconds(-1) }));
    await boot(page);
    await expect(page.locator('#load-message')).toHaveText('Account expired');
    renewed = true;
    await press(page, 'Enter');
    await expect(page.locator('#load-error')).toBeHidden();
});

async function saveCatalogue(page, key, value) {
    await page.evaluate(([key, value]) => new Promise((resolve, reject) => {
        const open = indexedDB.open('iptvnator-tv', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const tx = open.result.transaction('catalogue', 'readwrite');
            tx.objectStore('catalogue').put(value, key);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        };
    }), [key, value]);
}

test('rows show a failed check as Not responding and M3U sources only their type and saved count', async ({ page }, testInfo) => {
    const base = testInfo.project.use.baseURL;
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await answerAccounts(page, user => user === 'gone' ? { http: 503 } : null);
    await boot(page, { storage: { sources: [
        { id: 's1', type: 'xtream', name: 'Regression TV', url: base, user: 'tester', pass: 'secret' },
        { id: 's2', type: 'xtream', name: 'Gone TV', url: base, user: 'gone', pass: 'x' },
        { id: 's3', type: 'm3u', name: 'Playlist', url: base + '/playlist.m3u' },
    ] } });
    await saveCatalogue(page, 's2|live:items:', [{}, {}, {}]);
    await saveCatalogue(page, 's3|live:categories', [{ category_id: '', category_name: 'All channels', count: 12 }]);
    await openSources(page);
    requests.length = 0;
    const rows = page.locator('#categories .row');
    await expect(rows.nth(1)).toContainText('Gone TV');
    await expect(rows.nth(1).locator('.badge')).toHaveText('Not responding');
    await expect(rows.nth(1)).toContainText('3 channels');
    await expect(rows.nth(2)).toContainText('12 channels');
    await expect(rows.nth(2).locator('.badge')).toHaveText('M3U');
    await expect(rows.nth(2)).not.toContainText('Expires');
    await moveTo(page, '#categories .focused .label', 'Gone TV');
    await expect(page.locator('#items')).toContainText('Status: Not responding');
    await moveTo(page, '#categories .focused .label', 'Playlist');
    await expect(page.locator('#items')).toContainText('12 channels in the catalogue');
    await expect(page.locator('#items')).not.toContainText('Status:');
    // Showing the rows must not download the playlist or another source's lists.
    expect(requests.filter(url => /playlist\.m3u|username=gone.*action=get_/.test(url))).toHaveLength(0);
});

test('Edit source reuses the add form; a new name keeps everything, a new login reloads', async ({ page }) => {
    const calls = [];
    page.on('request', request => {
        if (new URL(request.url()).pathname === '/player_api.php') calls.push({ action: new URL(request.url()).searchParams.get('action'), user: accountUser(request) });
    });
    await answerAccounts(page, user => user === 'bad' ? { auth: 0 } : null);
    await boot(page, { storage: { 'recent:s1': { movies: [{ name: 'Movie 25', stream_id: 2025 }] } } });
    await openSources(page);
    await enterItems(page);
    await moveTo(page, '#items .focused .label', 'Edit source…');
    await press(page, 'Enter');
    await expect(page.locator('#form-title')).toHaveText('Edit source');
    await expect(page.locator('#form-name')).toHaveValue('Regression TV');
    await expect(page.locator('#form-user')).toHaveValue('tester');
    await expect(page.locator('#form-pass')).toHaveValue('secret');
    await expect(page.locator('#form-pass')).toHaveAttribute('type', 'password');
    await expect(page.locator('#form-name')).toBeFocused();

    // A new name alone neither asks the provider nor reloads anything.
    const before = calls.length;
    await page.locator('#form-name').fill('Living room');
    await page.locator('#form-save').click();
    await expect(page.locator('#form')).toBeHidden();
    await expect(page.locator('#source-name')).toHaveText('Living room');
    await expect(page.locator('#categories .row').first()).toContainText('Living room');
    await page.waitForTimeout(500);
    expect(calls.length).toBe(before);
    const saved = () => page.evaluate(() => ({
        sources: JSON.parse(localStorage.getItem('iptvnator-tv:sources')),
        current: JSON.parse(localStorage.getItem('iptvnator-tv:current')),
        recent: localStorage.getItem('iptvnator-tv:recent:s1'),
    }));
    let now = await saved();
    expect(now.sources.map(s => s.id + ':' + s.name)).toEqual(['s1:Living room']);
    expect(now.current).toBe('s1');
    expect(now.recent).not.toBeNull();

    // A login the provider refuses is not saved.
    await moveTo(page, '#items .focused .label', 'Edit source…');
    await press(page, 'Enter');
    await page.locator('#form-user').fill('bad');
    await page.locator('#form-save').click();
    await expect(page.locator('#form-msg')).toContainText('Could not connect');
    await expect(page.locator('#form')).toBeVisible();
    await page.locator('#form-user').fill('newuser');
    await page.locator('#form-pass').fill('other');
    await page.locator('#form-save').click();
    await expect(page.locator('#form')).toBeHidden();
    // The source keeps its id and library; its account is read again with the new login.
    await expect.poll(() => calls.some(c => c.user === 'newuser' && !c.action)).toBe(true);
    now = await saved();
    expect(now.sources.map(s => s.id + ':' + s.user + ':' + s.pass)).toEqual(['s1:newuser:other']);
    expect(now.recent).not.toBeNull();
    await expect(page.locator('#source-name')).toHaveText('Living room');
    await section(page, 'Live TV');
    await expect.poll(() => calls.some(c => c.user === 'newuser' && c.action === 'get_live_categories')).toBe(true);
    await expect(page.locator('#items .row').first()).toBeVisible();
});

test('editing another source drops its saved catalogue only when the login changes', async ({ page }, testInfo) => {
    const base = testInfo.project.use.baseURL;
    await boot(page, { storage: { sources: [
        { id: 's1', type: 'xtream', name: 'Regression TV', url: base, user: 'tester', pass: 'secret' },
        { id: 's2', type: 'xtream', name: 'Second', url: base, user: 'other', pass: 'x' },
    ] } });
    await saveCatalogue(page, 's2|live:items:', [{}, {}, {}, {}]);
    await openSources(page);
    await moveTo(page, '#categories .focused .label', 'Second');
    await expect(page.locator('#categories .row.selected, #categories .row.focused')).toContainText('4 channels');
    await holdOK(page);
    await expect(page.locator('#menu')).toContainText('Guide link…');
    await menuChoice(page, 'Edit source…');
    await expect(page.locator('#form-title')).toHaveText('Edit source');
    await page.locator('#form-name').fill('Bedroom');
    await page.locator('#form-save').click();
    await expect(page.locator('#form')).toBeHidden();
    await expect(page.locator('#source-name')).toHaveText('Regression TV');
    await expect(page.locator('#categories .row').nth(1)).toContainText('Bedroom');
    await expect(page.locator('#categories .row').nth(1)).toContainText('4 channels');
    await enterItems(page);
    await moveTo(page, '#items .focused .label', 'Edit source…');
    await press(page, 'Enter');
    await page.locator('#form-pass').fill('changed');
    await page.locator('#form-save').click();
    await expect(page.locator('#form')).toBeHidden();
    await expect(page.locator('#categories .row').nth(1)).toContainText('Bedroom');
    await expect(page.locator('#categories .row').nth(1)).not.toContainText('4 channels');
    await expect(page.locator('#source-name')).toHaveText('Regression TV');
});

test('Return cancels Edit source and keeps the saved source', async ({ page }) => {
    await boot(page);
    await openSources(page);
    await holdOK(page);
    await menuChoice(page, 'Edit source…');
    await page.locator('#form-name').fill('Nope');
    await page.locator('#form-cancel').click();
    await expect(page.locator('#form')).toBeHidden();
    await expect(page.locator('#source-name')).toHaveText('Regression TV');
});
