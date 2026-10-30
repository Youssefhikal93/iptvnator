const { test, expect, boot, section, press, sendKeyCode, back, playing, menuChoice } = require('./helpers');

const root = page => page.locator('#programme-search');
const cards = page => root(page).locator('.hm-card');
const titles = page => root(page).locator('.hm-row h2');

async function cachedGuide(page, baseURL) {
    const now = Date.now();
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);
    const stamp = ms => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000';
    const schedules = [
        [1, 'Liverpool live', now - 600000, now + 600000],
        [1, 'Liverpool replay', now - 7200000, now - 3600000],
        [101, 'Liverpool next', now + 600000, tomorrow.getTime()],
        [2, 'Liverpool tomorrow', tomorrow.getTime(), tomorrow.getTime() + 3600000],
    ];
    const channels = [1, 2, 101].map(n => `<channel id="ch${1000 + n}.se"><display-name>Channel ${n}</display-name></channel>`).join('');
    const programmes = schedules.map(([n, title, start, end]) => `<programme channel="ch${1000 + n}.se" start="${stamp(start)}" stop="${stamp(end)}"><title>${title}</title></programme>`).join('');
    await page.route('**/search-guide.xml', route => route.fulfill({ contentType: 'application/xml', body: '<tv>' + channels + programmes + '</tv>' }));
    await boot(page, { storage: { sources: [{ id: 's1', type: 'xtream', name: 'Regression TV', url: baseURL, user: 'tester', pass: 'secret', epgUrl: baseURL + '/search-guide.xml' }] } });
    await expect.poll(() => page.evaluate(() => XmltvGuide.times('s1').updatedAt)).toBeGreaterThan(0);
    await section(page, 'Live TV');
}

async function search(page, query) {
    await sendKeyCode(page, 406);
    await expect(root(page)).toBeVisible();
    await expect(root(page).locator('input')).toBeFocused();
    await page.keyboard.type(query);
    await press(page, 'Enter');
}

test('#81 searches all cached XMLTV channels, groups programmes and offers live, catch-up and reminders', async ({ page, baseURL }) => {
    await cachedGuide(page, baseURL);
    await sendKeyCode(page, 458);
    await expect(page.locator('#guide .gd-programme.focused')).toContainText('Liverpool live');
    await search(page, 'liverpool');
    await expect(titles(page)).toHaveText(['On now', 'Later today', 'Coming days']);
    await expect(cards(page).filter({ hasText: 'Liverpool next' })).toContainText('Channel 101');
    await expect(cards(page).first().locator('small')).toHaveText(/Channel 1.*\d\d:\d\d - \d\d:\d\d/);
    await expect(cards(page).first().locator('.plate')).toBeVisible();
    // Same channel has multiple programmes; OK must keep the programme identity.
    await press(page, 'Enter');
    await expect(page.locator('#menu')).toContainText('Watch now');
    await expect(page.locator('#menu')).toContainText('Watch from start');
    await menuChoice(page, 'Watch now');
    await playing(page);
    await expect(page.locator('#pl-controls')).toBeHidden({ timeout: 10000 });
    await back(page);
    await expect(root(page)).toBeVisible();
    await expect(cards(page).first()).toHaveClass(/focus/);
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#menu .focused')).toHaveText('Remind me');
    await press(page, 'Enter');
    await expect(page.locator('#menu .focused')).toHaveText('Remove reminder');
    expect(await page.evaluate(() => Reminders.list().map(entry => entry.title))).toEqual(['Liverpool next']);
    await press(page, 'Enter');
    expect(await page.evaluate(() => Reminders.list())).toEqual([]);
    await back(page);
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await expect(root(page).locator('.hm-row').last().locator('h2')).toHaveText('Past (catch-up)');
    await press(page, 'Enter');
    await expect(page.locator('#menu')).not.toContainText('Watch now');
    await menuChoice(page, 'Watch from start');
    await playing(page);
    await expect(page.locator('#pl-controls')).toBeHidden({ timeout: 10000 });
    await expect(page.locator('#pl-title')).toContainText('Liverpool replay');
    await back(page);
    await expect(root(page)).toBeVisible();
    await back(page);
    await expect(root(page)).toBeHidden();
    await expect(page.locator('#guide')).toBeVisible();
});

test('#81 Home Search reaches cached programmes, debounces typing and never requests provider schedules', async ({ page, baseURL }) => {
    await cachedGuide(page, baseURL);
    await section(page, 'Home');
    await press(page, 'ArrowUp');
    await press(page, 'Enter');
    await expect(page.locator('#home .hm-search')).toContainText('Blue: Search programmes');
    await page.waitForLoadState('networkidle');
    const requests = [];
    page.on('request', request => {
        if (new URL(request.url()).pathname === '/player_api.php') requests.push(new URL(request.url()).searchParams.get('action'));
    });
    await sendKeyCode(page, 406);
    await root(page).locator('input').fill('no match');
    await root(page).locator('input').fill('Liverpool');
    await expect(cards(page).first()).toContainText('Liverpool live');
    await press(page, 'Enter');
    expect(requests).toHaveLength(0);
    await back(page);
    await expect(page.locator('#home .hm-search')).toBeVisible();
    // A new search session reads the persisted XMLTV generation after reload.
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-source', 'Regression TV');
    await press(page, 'ArrowUp');
    await press(page, 'Enter');
    await search(page, 'Liverpool');
    await expect(cards(page).first()).toContainText('Liverpool live');
});

test('#81 excludes hidden categories and Kids-disallowed channels from all cached matches', async ({ page, baseURL }) => {
    await cachedGuide(page, baseURL);
    await page.evaluate(() => HiddenCategories.hide('s1', 'live', '12'));
    await sendKeyCode(page, 458);
    await search(page, 'Liverpool');
    await expect(titles(page)).toHaveText(['On now', 'Coming days', 'Past (catch-up)']);
    await expect(cards(page).filter({ hasText: 'Liverpool next' })).toHaveCount(0);
    await back(page);
    await page.evaluate(() => {
        const kids = ProfileStore.add('Kids');
        ProfileStore.setKids(kids.id, 'default');
        KidsProfile.save(kids.id, 's1', { live: ['2'], movies: [], series: [] });
        ProfileStore.setActive(kids.id);
    });
    await search(page, 'Liverpool');
    await expect(titles(page)).toHaveText(['On now', 'Past (catch-up)']);
    await expect(cards(page).filter({ hasText: 'Liverpool tomorrow' })).toHaveCount(0);
});

test('#81 a source without XMLTV searches only already loaded provider schedules', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await sendKeyCode(page, 458);
    await expect(page.locator('#guide .gd-loading')).toHaveCount(0);
    const requests = [];
    page.on('request', request => {
        if (new URL(request.url()).searchParams.get('action') === 'get_simple_data_table') requests.push(request);
    });
    await search(page, 'Program');
    await expect(cards(page).first()).toContainText('Program');
    expect(requests).toHaveLength(0);
    await back(page);
    await expect(page.locator('#guide')).toBeVisible();
});
