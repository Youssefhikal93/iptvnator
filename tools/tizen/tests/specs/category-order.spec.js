const { test, expect, boot, section, category, press, back, holdOK, menuChoice, moveTo, setting, enterItems, playing, sourceMenu } = require('./helpers');

const labels = page => page.locator('#categories .row .label').allTextContents();
const focused = page => page.locator('#categories .focused .label');
const orders = page => page.evaluate(() => Stored.json(ProfileStore.key('list-order:s1')) || {});

for (const [name, prefix, scope, all] of [
    ['Live TV', 'get_live_categories', 'live', 'All channels'],
    ['Movies', 'get_vod_categories', 'movies', 'All movies'],
    ['Series', 'get_series_categories', 'series', 'All series'],
]) {
    test(`#87 ${name}: Move cancels or places, All can move, and reset restores provider order after reload`, async ({ page }) => {
        await boot(page, { storage: { settings: { motion: 'off' } } });
        await section(page, name);
        await category(page, prefix + ' cat 2');
        const before = await labels(page);
        await holdOK(page);
        await expect(page.locator('#menu .menu-row', { hasText: 'Reset order' })).toHaveCount(0);
        await menuChoice(page, 'Move');
        await expect(page.locator('#categories .move-lifted .label')).toHaveText(prefix + ' cat 2');
        await expect(page.locator('#move-hint')).toHaveText('▲▼ move · OK place · Return cancel');
        await press(page, 'ArrowUp');
        expect((await labels(page)).indexOf(prefix + ' cat 2')).toBeLessThan((await labels(page)).indexOf(prefix + ' cat 1'));
        expect(await page.locator('#categories .move-lifted').evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s');
        await back(page);
        await expect(focused(page)).toHaveText(prefix + ' cat 2');
        expect(await labels(page)).toEqual(before);
        expect((await orders(page))['categories:' + scope]).toBeUndefined();

        await holdOK(page);
        await menuChoice(page, 'Move');
        await press(page, 'ArrowUp');
        await press(page, 'Enter');
        await expect(page.locator('#move-hint')).toBeHidden();
        expect((await orders(page))['categories:' + scope].indexOf('2')).toBeLessThan((await orders(page))['categories:' + scope].indexOf('1'));
        await page.reload();
        await section(page, name);
        expect((await labels(page)).indexOf(prefix + ' cat 2')).toBeLessThan((await labels(page)).indexOf(prefix + ' cat 1'));

        await moveTo(page, '#categories .focused .label', all, 'ArrowUp');
        await holdOK(page);
        await menuChoice(page, 'Move');
        await press(page, 'ArrowDown');
        await press(page, 'Enter');
        await expect(focused(page)).toHaveText(all);
        await holdOK(page);
        await menuChoice(page, 'Reset order');
        expect((await orders(page))['categories:' + scope]).toBeUndefined();
        await moveTo(page, '#categories .focused .label', prefix + ' cat 2', 'ArrowDown');
        await holdOK(page);
        await menuChoice(page, 'Move to top');
        await expect(page.locator('#categories .row .label').first()).toHaveText(prefix + ' cat 2');
        await holdOK(page);
        await menuChoice(page, 'Reset order');
        expect((await labels(page)).indexOf(prefix + ' cat 1')).toBeLessThan((await labels(page)).indexOf(prefix + ' cat 2'));
    });
}

test('#87 Manage categories uses Move while searching without losing unlisted categories', async ({ page }) => {
    await boot(page);
    await setting(page, 'Manage Movies categories');
    await press(page, 'Enter');
    await expect(page.locator('#manage .focused .label')).toHaveText('get_vod_categories cat 1');
    await holdOK(page);
    await menuChoice(page, 'Move');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#manage .row .label').nth(1)).toHaveText('get_vod_categories cat 2');
    await expect(page.locator('#manage .focused .label')).toHaveText('get_vod_categories cat 1');
    await holdOK(page);
    await menuChoice(page, 'Reset order');
    await expect(page.locator('#manage .row .label').nth(1)).toHaveText('get_vod_categories cat 1');
    await press(page, 'ArrowUp'); // All movies
    await press(page, 'ArrowUp'); // Search
    await press(page, 'Enter');
    await page.locator('.mc-search input').fill('cat 2');
    await press(page, 'Enter');
    await press(page, 'ArrowDown'); // cat 20
    await holdOK(page);
    await menuChoice(page, 'Move');
    await press(page, 'ArrowUp');
    await press(page, 'Enter');
    await expect(page.locator('#manage .row .label').first()).toHaveText('get_vod_categories cat 20');
    expect((await orders(page))['categories:movies']).toHaveLength(34);
    await back(page);
    await expect(page.locator('#manage')).toBeHidden();
});

test('#87 the playing channel list follows the saved category order', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await category(page, 'get_live_categories cat 2');
    await holdOK(page);
    await menuChoice(page, 'Move to top');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await expect.poll(() => page.evaluate(() => Player.canOpenChannelList())).toBe(true);
    await press(page, 'ArrowLeft');
    await expect(page.locator('.pl-channel-header')).toContainText('get_live_categories cat 2');
    await press(page, 'ArrowRight');
    await expect(page.locator('.pl-channel-header')).toContainText('Favorites');
    await press(page, 'ArrowRight');
    await expect(page.locator('.pl-channel-header')).toContainText('All channels');
    await press(page, 'ArrowRight');
    await expect(page.locator('.pl-channel-header')).toContainText('get_live_categories cat 1');
});

test('#87 source refresh keeps order, appends new provider categories and drops removed ones', async ({ page }) => {
    let fresh = false;
    await page.route('**/player_api.php*', async route => {
        if (fresh && new URL(route.request().url()).searchParams.get('action') === 'get_live_categories') {
            return route.fulfill({ json: ['1', '2', '4', '31'].map(id => ({ category_id: id, category_name: 'Fresh category ' + id })) });
        }
        await route.continue();
    });
    await boot(page);
    await section(page, 'Live TV');
    await category(page, 'get_live_categories cat 3');
    await holdOK(page);
    await menuChoice(page, 'Move to top');
    fresh = true;
    await sourceMenu(page);
    await menuChoice(page, 'Refresh source');
    await expect(page.locator('#rail .active')).toHaveText('Home');
    await section(page, 'Live TV');
    const saved = (await orders(page))['categories:live'];
    expect(saved).not.toContain('3');
    expect(saved.indexOf('1')).toBeLessThan(saved.indexOf('2'));
    expect(saved.at(-1)).toBe('31');
    expect(await labels(page)).toContain('Fresh category 31');
});
