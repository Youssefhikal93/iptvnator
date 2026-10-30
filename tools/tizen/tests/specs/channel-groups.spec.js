const { test, expect, boot, section, category, enterItems, press, back, holdOK, menuChoice, moveTo, playing, channel } = require('./helpers');

const groups = page => page.evaluate(() => Stored.json(ProfileStore.key('channel-groups:s1')) || []);

async function nameGroup(page, name) {
    await expect(page.locator('#profile-dialog')).toBeVisible();
    await page.locator('#profile-name').fill(name);
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#profile-dialog')).toHaveCount(0);
}

async function groupPicker(page) {
    await moveTo(page, '#menu .focused', 'Add to group');
    await press(page, 'Enter');
    await expect(page.locator('#menu .menu-title')).toHaveText('Add to group');
}

async function ownGroup(page, name) {
    await press(page, 'ArrowLeft');
    await moveTo(page, '#categories .focused .label', name, 'ArrowUp');
    await expect(page.locator('#items .list-header')).toContainText(name);
    await enterItems(page);
}

test('#76 create, add, order and play a live group; zap and drawer follow it; rename/remove/delete persist', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await enterItems(page);
    await holdOK(page);
    await groupPicker(page);
    await menuChoice(page, 'New group');
    await nameGroup(page, 'My TV');
    await press(page, 'ArrowDown');
    await holdOK(page);
    await groupPicker(page);
    await menuChoice(page, 'My TV');
    expect((await groups(page))[0].channels.map(item => item.stream_id)).toEqual([1001, 1002]);
    await ownGroup(page, 'My TV');
    await press(page, 'ArrowLeft');
    await holdOK(page);
    // A new group starts after the library rows; move it above Recently watched.
    await expect(page.locator('#categories .row .label').nth(3)).toHaveText('My TV');
    await menuChoice(page, 'Move');
    await press(page, 'ArrowUp');
    await press(page, 'Enter');
    await expect(page.locator('#categories .row .label').nth(1)).toHaveText('Favorites');
    await expect(page.locator('#categories .row .label').nth(2)).toHaveText('My TV');
    await enterItems(page);
    await press(page, 'ArrowDown');
    await holdOK(page);
    await menuChoice(page, 'Move');
    await expect(page.locator('#items .move-lifted .label')).toContainText('Channel 2');
    await press(page, 'ArrowUp');
    await back(page);
    expect((await groups(page))[0].channels.map(item => item.stream_id)).toEqual([1001, 1002]);
    await holdOK(page);
    await menuChoice(page, 'Move');
    await press(page, 'ArrowUp');
    await press(page, 'Enter');
    await expect(page.locator('#items .row .label').first()).toContainText('Channel 2');
    await page.reload();
    await section(page, 'Live TV');
    await moveTo(page, '#categories .focused .label', 'My TV', 'ArrowUp');
    await enterItems(page);
    await expect(page.locator('#items .focused .label')).toContainText('Channel 2');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-title')).toContainText('Channel 2');
    await press(page, 'ArrowUp');
    await playing(page);
    await expect(page.locator('#pl-title')).toContainText('Channel 1');
    await expect.poll(() => page.evaluate(() => Player.canOpenChannelList())).toBe(true);
    await press(page, 'ArrowLeft');
    await expect(page.locator('.pl-channel-header')).toContainText('My TV');
    await expect(page.locator('.pl-channel-name').first()).toContainText('Channel 2');
    await back(page);
    await back(page);
    await holdOK(page);
    await menuChoice(page, 'Remove from group');
    await expect(page.locator('#items .row')).toHaveCount(1);
    await press(page, 'ArrowLeft');
    await holdOK(page);
    await menuChoice(page, 'Rename group');
    await nameGroup(page, 'Evening');
    await expect(page.locator('#categories .focused .label')).toHaveText('Evening');
    await holdOK(page);
    await menuChoice(page, 'Manage categories');
    await expect(page.locator('#manage')).toBeVisible();
    await moveTo(page, '#manage .focused .label', 'Evening', 'ArrowUp');
    await holdOK(page);
    await menuChoice(page, 'Move');
    await press(page, 'ArrowDown');
    await back(page);
    await expect(page.locator('#manage')).toBeVisible();
    await holdOK(page);
    await menuChoice(page, 'Rename group');
    await nameGroup(page, 'Night');
    await expect(page.locator('#manage .focused .label')).toHaveText('Night');
    await back(page);
    await expect(page.locator('#categories .focused .label')).toHaveText('Night');
    await holdOK(page);
    await menuChoice(page, 'Delete group');
    await expect(page.locator('#profile-dialog-cancel')).toBeFocused();
    await press(page, 'ArrowLeft');
    await press(page, 'Enter');
    expect(await groups(page)).toEqual([]);
    await expect(page.locator('#categories')).not.toContainText('Night');
});

test('#76 live Favorites share Move and Move to top and retain their order after reload', async ({ page }) => {
    await boot(page, { storage: { 'favorites:s1': { live: [channel(1), channel(2), channel(3)] } } });
    await section(page, 'Live TV');
    // Enter and move before the category debounce can replace the old list.
    await page.evaluate(() => {
        [Keys.UP, Keys.UP, Keys.RIGHT, Keys.DOWN].forEach(keyCode => document.dispatchEvent(new KeyboardEvent('keydown', { keyCode, which: keyCode, bubbles: true })));
    });
    await expect(page.locator('#items .count')).toHaveText('2 / 3');
    await holdOK(page);
    await menuChoice(page, 'Move');
    await expect(page.locator('#items .move-lifted .label')).toContainText('Channel 2');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#items .row .label')).toContainText(['1. Channel 1 (cat all)', '3. Channel 3 (cat all)', '2. Channel 2 (cat all)']);
    await holdOK(page);
    await menuChoice(page, 'Move to top');
    await page.reload();
    await section(page, 'Live TV');
    await category(page, 'Favorites');
    await expect(page.locator('#items .row .label').first()).toContainText('Channel 2');
});

test('#76/#87 Kids see allowed categories and group channels in their saved order, including zapping', async ({ page }) => {
    await boot(page, { storage: {
        'channel-groups:s1': [{ id: '__group_kids', name: 'My TV', channels: [channel(1), channel(2), channel(3)] }],
        'list-order:s1': { 'categories:live': ['3', '__group_kids', '4', '2', ''], 'channels:__group_kids': ['1003', '1002', '1001'] },
    } });
    await page.evaluate(() => {
        ProfileStore.setKids('default', 'guardian');
        KidsProfile.save('default', 's1', { live: ['2', '4'], movies: [], series: [] });
    });
    await section(page, 'Live TV');
    const names = await page.locator('#categories .row .label').allTextContents();
    expect(names).not.toContain('get_live_categories cat 3');
    expect(names.indexOf('get_live_categories cat 4')).toBeLessThan(names.indexOf('get_live_categories cat 2'));
    await moveTo(page, '#categories .focused .label', 'My TV', 'ArrowUp');
    await expect(page.locator('#items .row .label')).toContainText(['3. Channel 3', '1. Channel 1']);
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await press(page, 'ArrowUp');
    await expect(page.locator('#pl-title')).toContainText('Channel 1');
    await expect.poll(() => page.evaluate(() => Player.canOpenChannelList())).toBe(true);
    await press(page, 'ArrowLeft');
    await expect(page.locator('.pl-channel-header')).toContainText('My TV');
    await expect(page.locator('.pl-channel-name')).toContainText(['Channel 3', 'Channel 1']);
});

test('#76 a group opened first resolves Kids permissions from the catalogue before playing', async ({ page }) => {
    let loads = 0;
    page.on('request', request => { if (new URL(request.url()).searchParams.get('action') === 'get_live_streams') loads++; });
    await boot(page, { storage: {
        'channel-groups:s1': [{ id: '__group_first', name: 'My TV', channels: [{ ...channel(1), category_id: '99', name: 'Old category' }] }],
        'list-order:s1': { 'categories:live': ['__fav', '__recent', '', '__group_first'] },
    } });
    await page.evaluate(() => {
        ProfileStore.setKids('default', 'guardian');
        KidsProfile.save('default', 's1', { live: ['2'], movies: [], series: [] });
    });
    await section(page, 'Live TV');
    await expect(page.locator('#categories .focused .label')).toHaveText('My TV');
    await expect(page.locator('#items .row .label')).toContainText(['1. Channel 1 (cat all)']);
    expect(loads).toBe(1);
});
