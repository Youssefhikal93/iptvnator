const { test, expect, boot, resumeSeed, movie, show, channel, section, press, back, moveTo, setting } = require('./helpers');

const P = 'iptvnator-tv:';

// Data in the format written before profiles existed: boot() seeds old keys.
function oldSeed() {
    const seed = resumeSeed();
    seed.storage['favorites:s1'] = { movies: [movie(7)], series: [show()], live: [channel()] };
    seed.storage.settings = { homeLayout: 'bigrow', tmdbApiKey: 'tmdb-secret' };
    seed.storage['hidden-categories:s1'] = { live: ['12'] };
    return seed;
}

const stored = (page, key) => page.evaluate(key => localStorage.getItem(key), key);
const profiles = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), P + 'profiles');
const row = (page, label) => page.locator('.st-row').filter({ has: page.locator('.st-label', { hasText: label }) });

async function settingsRow(page, label) {
    await setting(page, label);
}

async function enterName(page, name) {
    await expect(page.locator('#profile-dialog')).toBeVisible();
    await page.locator('#profile-name').fill(name);
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#profile-dialog')).toHaveCount(0);
}

async function addProfile(page, name) {
    await settingsRow(page, 'Add profile…');
    await press(page, 'Enter');
    await enterName(page, name);
}

async function reloadAndPick(page, name) {
    await page.reload();
    await expect(page.locator('#profiles')).toBeVisible();
    for (let i = 0; i < 6; i++) await press(page, 'ArrowLeft');
    await moveTo(page, '#profiles .pf-tile.focused .pf-name', name, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#profiles')).toHaveCount(0);
    await expect(page.locator('#rail .rail-item')).toHaveCount(6);
}

test('old-format data moves under the profile Me and looks unchanged', async ({ page }) => {
    await boot(page, oldSeed());
    await expect(page.locator('.hm-row.big h2')).toContainText('Continue watching');
    await expect(page.locator('.hm-row.big .hm-card').first()).toContainText('Movie 25');
    await expect(page.locator('#home')).toHaveClass(/bigrow/);
    expect(await profiles(page)).toEqual([expect.objectContaining({ id: 'default', name: 'Me' })]);
    expect(await stored(page, P + 'profile')).toBe('default');
    expect(await stored(page, P + 'profiles-version')).toBe('1');
    for (const name of ['progress', 'settings', 'favorites:s1', 'recent:s1', 'hidden-categories:s1']) {
        expect(await stored(page, P + name)).toBeNull();
        expect(await stored(page, P + 'p:default:' + (name === 'progress' ? 'progress:s1' : name))).not.toBeNull();
    }
    expect(await stored(page, P + 'p:default:progress')).toBeNull();
    expect(await stored(page, P + 'p:default:progress:legacy')).not.toBeNull();
    // Sources stay shared and the TMDB key moves to the shared settings.
    expect(await stored(page, P + 'sources')).not.toBeNull();
    expect(JSON.parse(await stored(page, P + 'shared-settings')).tmdbApiKey).toBe('tmdb-secret');
    await section(page, 'Settings');
    await expect(row(page, 'Current profile').locator('.st-value')).toHaveText('Me');
    await expect(row(page, 'TMDB API key').locator('.st-value')).toContainText('cret');
    // One profile never asks who is watching, even after a reload.
    await page.reload();
    await expect(page.locator('#rail .rail-item')).toHaveCount(6);
    await expect(page.locator('#profiles')).toHaveCount(0);
});

test('a second profile starts empty with its own settings; Who is watching appears on reload', async ({ page }) => {
    await boot(page, oldSeed());
    await addProfile(page, 'Anna');
    // Adding opens the new profile: its Home has none of the first profile's data.
    await expect(page.locator('#home')).not.toHaveClass(/bigrow/);
    await expect(page.locator('#home')).not.toContainText('Continue watching');
    await expect(page.locator('#home')).not.toContainText('Favorite movies');
    expect((await profiles(page)).map(p => p.name)).toEqual(['Me', 'Anna']);
    await section(page, 'Movies');
    await section(page, 'Settings');
    await expect(row(page, 'Current profile').locator('.st-value')).toHaveText('Anna');
    await expect(row(page, 'Home layout').locator('.st-value')).toHaveText('Cinema');
    // The TMDB key is shared by every profile.
    await expect(row(page, 'TMDB API key').locator('.st-value')).toContainText('cret');

    await page.reload();
    await expect(page.locator('#profiles')).toBeVisible();
    await expect(page.locator('#profiles .pf-name')).toHaveText(['Me', 'Anna', 'Add profile']);
    // The active profile has the focus.
    await expect(page.locator('#profiles .pf-tile.focused .pf-name')).toHaveText('Anna');
    await press(page, 'ArrowLeft');
    await press(page, 'Enter');
    await expect(page.locator('#rail .rail-item')).toHaveCount(6);
    await expect(page.locator('.hm-row.big .hm-card').first()).toContainText('Movie 25');
    await expect(page.locator('#home')).toHaveClass(/bigrow/);
});

test('switching in Settings reloads Home with that profile data and back again', async ({ page }) => {
    await boot(page, oldSeed());
    await addProfile(page, 'Anna');
    await section(page, 'Movies');
    await section(page, 'Settings');
    await settingsRow(page, 'Current profile');
    await press(page, 'Enter');
    await expect(page.locator('#profiles')).toBeVisible();
    await press(page, 'ArrowLeft');
    await press(page, 'Enter');
    await expect(page.locator('#profiles')).toHaveCount(0);
    await expect(page.locator('.hm-row.big .hm-card').first()).toContainText('Movie 25');
    await expect(page.locator('#home')).toHaveClass(/bigrow/);
    expect(await stored(page, P + 'profile')).toBe('default');
    // Favorites follow the profile in the browser list too.
    await section(page, 'Movies');
    await press(page, 'ArrowUp');
    await expect(page.locator('#categories .focused .label')).toBeVisible();
    // Return closes the switcher without changing anything.
    await settingsRow(page, 'Current profile');
    await press(page, 'Enter');
    await expect(page.locator('#profiles')).toBeVisible();
    await back(page);
    await expect(page.locator('#profiles')).toHaveCount(0);
    expect(await stored(page, P + 'profile')).toBe('default');
});

test('favorites made in one profile stay out of the other', async ({ page }) => {
    await boot(page, oldSeed());
    await addProfile(page, 'Anna');
    expect(await stored(page, P + 'p:default:favorites:s1')).toContain('Movie 7');
    const anna = (await profiles(page))[1].id;
    expect(await stored(page, P + 'p:' + anna + ':favorites:s1')).toBeNull();
    expect(await stored(page, P + 'p:' + anna + ':progress:s1')).toBeNull();
    expect(await stored(page, P + 'p:' + anna + ':hidden-categories:s1')).toBeNull();
    expect(await stored(page, P + 'p:' + anna + ':settings')).toBeNull();
});

test('rename updates the name; duplicate and empty names are refused', async ({ page }) => {
    await boot(page, oldSeed());
    await settingsRow(page, 'Rename profile…');
    await press(page, 'Enter');
    await expect(page.locator('#profile-name')).toHaveValue('Me');
    await page.locator('#profile-name').fill('');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#profile-dialog-message')).toHaveText('Enter a name.');
    await page.locator('#profile-name').fill('Dad');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#profile-dialog')).toHaveCount(0);
    await expect(row(page, 'Current profile').locator('.st-value')).toHaveText('Dad');
    expect((await profiles(page))[0].name).toBe('Dad');
    await addProfile(page, 'Anna');
    await settingsRow(page, 'Add profile…');
    await press(page, 'Enter');
    await page.locator('#profile-name').fill('dad');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#profile-dialog-message')).toHaveText('That name is already used.');
    await back(page);
    await expect(page.locator('#profile-dialog')).toHaveCount(0);
    expect((await profiles(page)).length).toBe(2);
});

test('delete asks to confirm, removes the profile data and the last profile cannot be deleted', async ({ page }) => {
    await boot(page, oldSeed());
    await settingsRow(page, 'Delete profile');
    await expect(row(page, 'Delete profile').locator('.st-value')).toHaveText('Needs another profile');
    await press(page, 'Enter');
    await expect(page.locator('#toast')).toHaveText('The last profile cannot be deleted');
    await expect(page.locator('#profile-dialog')).toHaveCount(0);
    expect((await profiles(page)).length).toBe(1);

    await addProfile(page, 'Anna');
    const anna = (await profiles(page))[1].id;
    await section(page, 'Movies');
    await section(page, 'Settings');
    // Cancel keeps the profile.
    await settingsRow(page, 'Delete profile');
    await press(page, 'Enter');
    await expect(page.locator('#profile-dialog')).toContainText('Delete Anna?');
    await press(page, 'Enter');
    await expect(page.locator('#profile-dialog')).toHaveCount(0);
    expect((await profiles(page)).length).toBe(2);
    // Confirm removes it, switches to the remaining profile and reloads Home.
    await settingsRow(page, 'Delete profile');
    await press(page, 'Enter');
    await press(page, 'ArrowLeft');
    await press(page, 'Enter');
    await expect(page.locator('#profile-dialog')).toHaveCount(0);
    expect((await profiles(page)).map(p => p.name)).toEqual(['Me']);
    expect(await stored(page, P + 'profile')).toBe('default');
    expect(await page.evaluate(id => Object.keys(localStorage).filter(k => k.indexOf('iptvnator-tv:p:' + id + ':') === 0).length, anna)).toBe(0);
    await expect(page.locator('.hm-row.big .hm-card').first()).toContainText('Movie 25');
    // Back to one profile: the question is never asked.
    await page.reload();
    await expect(page.locator('#rail .rail-item')).toHaveCount(6);
    await expect(page.locator('#profiles')).toHaveCount(0);
});

test('Ask who is watching Off skips the screen; On brings it back', async ({ page }) => {
    await boot(page, oldSeed());
    await addProfile(page, 'Anna');
    await settingsRow(page, 'Ask who’s watching on start');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('On');
    await press(page, 'Enter');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('Off');
    await page.reload();
    await expect(page.locator('#rail .rail-item')).toHaveCount(6);
    await expect(page.locator('#profiles')).toHaveCount(0);
    // The last active profile stays; the choice is shared, not per profile.
    await section(page, 'Settings');
    await expect(row(page, 'Current profile').locator('.st-value')).toHaveText('Anna');
    await settingsRow(page, 'Ask who’s watching on start');
    await press(page, 'Enter');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('On');
    await page.reload();
    await expect(page.locator('#profiles')).toBeVisible();
});

test('at most six profiles; the picker then has no Add profile tile', async ({ page }) => {
    await boot(page, oldSeed());
    for (const name of ['B', 'C', 'D', 'E', 'F']) await addProfile(page, name);
    expect((await profiles(page)).length).toBe(6);
    await settingsRow(page, 'Add profile…');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('Up to 6');
    await press(page, 'Enter');
    await expect(page.locator('#toast')).toHaveText('Up to 6 profiles');
    await expect(page.locator('#profile-dialog')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('#profiles .pf-tile')).toHaveCount(6);
    await expect(page.locator('#profiles')).not.toContainText('Add profile');
});

test('Add profile on the picker creates and opens a profile', async ({ page }) => {
    await boot(page, oldSeed());
    await addProfile(page, 'Anna');
    await page.reload();
    await expect(page.locator('#profiles')).toBeVisible();
    await press(page, 'ArrowRight');
    await expect(page.locator('#profiles .pf-tile.focused .pf-name')).toHaveText('Add profile');
    await press(page, 'Enter');
    await enterName(page, 'Ben');
    await expect(page.locator('#profiles')).toHaveCount(0);
    await expect(page.locator('#rail .rail-item')).toHaveCount(6);
    expect((await profiles(page)).map(p => p.name)).toEqual(['Me', 'Anna', 'Ben']);
    await section(page, 'Settings');
    await expect(row(page, 'Current profile').locator('.st-value')).toHaveText('Ben');
});

test('the backup export holds only the active profile data', async ({ page }) => {
    await boot(page, oldSeed());
    await addProfile(page, 'Anna');
    // Anna has no progress: her stored progress key does not exist, Me keeps hers.
    const annaId = (await profiles(page))[1].id;
    expect(await stored(page, P + 'p:' + annaId + ':progress:s1')).toBeNull();
    const exported = await page.evaluate(() => JSON.stringify(BackupStore.read('progress', {})));
    expect(exported).toBe('{}');
    await reloadAndPick(page, 'Me');
    const mine = await page.evaluate(() => Object.keys(BackupStore.read('progress', {})));
    expect(mine).toContain('movie:2025');
});

test('a drawn avatar chosen in Settings shows on the rail, in its menu with every profile, and on Who is watching', async ({ page }) => {
    await boot(page);
    await addProfile(page, 'Anna');
    await settingsRow(page, 'Avatar');
    await press(page, 'Enter');
    await expect(page.locator('#avatar-picker .ap-choice')).toHaveCount(25);
    await expect(page.locator('#avatar-picker .ap-choice.focused')).toContainText('Letter');
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#avatar-picker')).toHaveCount(0);
    expect((await profiles(page))[1].avatar).toBe('fox');
    await expect(page.locator('#rail .rail-avatar.drawn .avatar-art')).toHaveCount(1);

    for (let i = 0; i < 12 && !await page.locator('#rail .focused').count(); i++) await back(page);
    for (let i = 0; i < 8 && !await page.locator('.rail-profile.focused').count(); i++) await press(page, 'ArrowUp');
    await press(page, 'Enter');
    await expect(page.locator('#menu .menu-row.with-icon .menu-label')).toHaveText(['Me', 'Anna']);
    await expect(page.locator('#menu .menu-row.with-icon').nth(1).locator('.menu-check')).toHaveCount(1);
    await expect(page.locator('#menu .menu-row.with-icon').nth(1).locator('.menu-avatar.drawn .avatar-art')).toHaveCount(1);
    await back(page);

    await page.reload();
    await expect(page.locator('#profiles')).toBeVisible();
    await expect(page.locator('#profiles .pf-tile.focused .pf-avatar.drawn .avatar-art')).toHaveCount(1);
    // ▲ on Who's watching opens the same picker; Return keeps the avatar.
    await press(page, 'ArrowUp');
    await expect(page.locator('#avatar-picker')).toBeVisible();
    await back(page);
    await expect(page.locator('#avatar-picker')).toHaveCount(0);
    await expect(page.locator('#profiles')).toBeVisible();
});
