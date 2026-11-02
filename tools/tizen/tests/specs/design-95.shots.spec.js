const { test, expect, boot, section, openFirst, press, back, holdOK, enterItems,
    playing, playerMenu, playerGroup, setting, moveTo, resumeSeed, movie, show, channel } = require('./helpers');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const service = require('../../tv-app/service/phone-remote');

const output = path.resolve(process.env.DESIGN_SHOTS || path.join(__dirname, '../design-95-shots'));
test.setTimeout(180_000);

async function shot(page, folder, name = 'en-dark-focused-pill') {
    await page.evaluate(() => document.fonts.ready);
    // Let the 180 ms focus transition finish before the owner reviews it.
    await page.waitForTimeout(240);
    const directory = path.join(output, folder);
    fs.mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, name + '.png') });
}

function seed(settings = {}) {
    const gallery = resumeSeed();
    gallery.storage.settings = { density: 'comfortable', ...settings };
    gallery.storage['favorites:s1'] = { movies: [movie(7), movie(14)], series: [show()], live: [channel()] };
    return gallery;
}

test('01–02 Home artwork, rail sections and profile focus', async ({ page }) => {
    await boot(page, seed());
    await expect(page.locator('.hm-hero-buttons .focus')).toBeVisible();
    await shot(page, '01-home', 'en-dark-hero');
    await shot(page, '02-rail-menu', 'en-dark-collapsed-home');
    await press(page, 'ArrowDown');
    await expect(page.locator('.hm-card.focus')).toBeVisible();
    await shot(page, '01-home');
    for (const name of ['Home', 'Live TV', 'Movies', 'Series', 'Settings']) {
        await section(page, name);
        await back(page);
        await expect(page.locator('#rail .rail-item.focused')).toContainText(name);
        await shot(page, '02-rail-menu', 'en-dark-' + name.toLowerCase().replace(/ /g, '-'));
    }
    await section(page, 'Home');
    await back(page);
    await press(page, 'ArrowUp');
    await expect(page.locator('.rail-profile.focused')).toBeVisible();
    await shot(page, '02-rail-menu', 'en-dark-avatar');
    await press(page, 'Enter');
    await expect(page.locator('#menu.profile-menu')).toBeVisible();
    await shot(page, '02-rail-menu', 'en-dark-profile-menu');
});

test('03 Live list, category options and channel hold-OK', async ({ page }) => {
    const gallery = seed();
    gallery.storage['channel-groups:s1'] = [{ id: '__group_design', name: 'Evening TV', channels: [channel()] }];
    await boot(page, gallery);
    await section(page, 'Live TV');
    await shot(page, '03-live-tv', 'en-dark-channel-list');
    await holdOK(page);
    await shot(page, '03-live-tv', 'en-dark-group-menu');
    await back(page);
    await enterItems(page);
    await holdOK(page);
    await shot(page, '03-live-tv', 'en-dark-hold-ok');
    await back(page);
    await press(page, 'ArrowLeft');
    await moveTo(page, '#categories .focused .label', 'Evening TV', 'ArrowUp');
    await holdOK(page);
    await expect(page.locator('#menu')).toContainText('Rename group');
    await shot(page, '03-live-tv', 'en-dark-own-group-menu');
});

test('04 Movies grid, detail and hold-OK', async ({ page }) => {
    await boot(page, seed());
    await section(page, 'Movies');
    await enterItems(page);
    await shot(page, '04-movies', 'en-dark-grid');
    await holdOK(page);
    await shot(page, '04-movies', 'en-dark-hold-ok');
    await back(page);
    await press(page, 'Enter');
    await expect(page.locator('#detail .dt-meta')).not.toContainText('Loading');
    await shot(page, '04-movies', 'en-dark-detail');
});

test('05 Series detail and episodes', async ({ page }) => {
    await boot(page, seed());
    await openFirst(page, 'Series');
    await shot(page, '05-series', 'en-dark-detail');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowRight');
    await expect(page.locator('#detail .dt-ep.focus')).toBeVisible();
    await shot(page, '05-series', 'en-dark-episodes');
});

test('06 Player bar, options, Quality choices, Settings and live zap', async ({ page }) => {
    await page.route(url => url.pathname === '/player_api.php' && url.searchParams.get('action') === 'get_vod_streams', async route => {
        const response = await route.fetch();
        const titles = await response.json();
        titles.forEach(title => {
            if (Number(title.stream_id) % 2 === 0) title.name = title.name.replace(/Movie (\d+)/, (_, n) => 'Movie ' + (Number(n) + 1)) + ' 4K';
        });
        await route.fulfill({ response, json: titles });
    });
    await boot(page, seed());
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await playing(page);
    await press(page, 'ArrowDown');
    await shot(page, '06-player', 'en-dark-player-bar');
    await playerMenu(page);
    await shot(page, '06-player', 'en-dark-options');
    await playerGroup(page, 'Quality');
    await expect(page.locator('#pl-menu .pl-menu-item')).toHaveCount(3);
    await shot(page, '06-player', 'en-dark-quality');
    await back(page);
    await back(page);
    await press(page, 'ArrowDown');
    // The gear opens the existing Settings part of the player menu.
    for (let i = 0; i < 12 && !await page.locator('.pl-gear.focus').count(); i++) await press(page, 'ArrowRight');
    await expect(page.locator('.pl-gear.focus')).toBeVisible();
    await press(page, 'Enter');
    await shot(page, '06-player', 'en-dark-settings');
    await back(page);
    await back(page);
    await back(page);
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await press(page, 'ArrowUp');
    await expect(page.locator('#pl-banner')).toBeVisible();
    await shot(page, '06-player', 'en-dark-zap-banner');
});

test('07 and 11 Settings, paired-phone action pills and phone remote', async ({ page, context }) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jotv-design-95-'));
    service.hooks.ip = () => '127.0.0.1';
    service.start(8778, { file: path.join(directory, 'phones.json') });
    try {
        await expect.poll(() => service.port()).toBe(8778);
        await boot(page, seed());
        await section(page, 'Settings');
        await shot(page, '07-settings', 'en-dark-list');
        await setting(page, 'Home layout');
        await shot(page, '07-settings', 'en-dark-display');
        await setting(page, 'Autoplay next episode');
        await shot(page, '07-settings', 'en-dark-playback');
        await setting(page, 'Pair a phone');
        await press(page, 'Enter');
        await expect(page.locator('#remote-url')).toHaveText(/:8778\/r\//);
        const phone = await context.newPage();
        await phone.setViewportSize({ width: 390, height: 844 });
        await phone.goto(await page.locator('#remote-url').innerText());
        await expect(phone.locator('#linkText')).toHaveText('Connected');
        await back(page);
        const phones = await fetch('http://127.0.0.1:8778/app/phones').then(response => response.json());
        await setting(page, phones[0].name);
        await expect(page.locator('.st-action-pill.focus')).toHaveText('Rename');
        await shot(page, '07-settings', 'en-dark-paired-phone-rename');
        await press(page, 'ArrowRight');
        await expect(page.locator('.st-action-pill.focus')).toHaveText('Forget');
        await shot(page, '07-settings', 'en-dark-paired-phone-forget');
        await press(page, 'ArrowDown');
        await expect(page.locator('.st-row.focused .st-label')).toHaveText('Forget all phones');
        await shot(page, '07-settings', 'en-dark-forget-all-focused');
        await shot(phone, '11-phone-remote', 'en-dark-390x844');
        await phone.locator('[data-jump="more"]').click();
        await shot(phone, '11-phone-remote', 'en-dark-more-390x844');
        await phone.close();
    } finally {
        service.stop();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('08–09 Profile card and actions, avatars, confirmation, PIN and picker', async ({ page }) => {
    await boot(page, seed());
    await page.evaluate(() => { ProfileStore.setAvatar(ProfileStore.active().id, Avatars.ids[0]); ProfileStore.add('Family'); });
    await setting(page, 'Current profile');
    await shot(page, '08-profiles', 'en-dark-profile-card');
    await press(page, 'ArrowDown');
    await shot(page, '08-profiles', 'en-dark-avatar-pill');
    await press(page, 'Enter');
    await expect(page.locator('#avatar-picker')).toBeVisible();
    await shot(page, '08-profiles', 'en-dark-avatar-picker');
    await back(page);
    await press(page, 'ArrowRight');
    await expect(page.locator('.st-row.focused .st-label')).toHaveText('Rename profile…');
    await shot(page, '08-profiles', 'en-dark-rename-pill');
    await setting(page, 'Current profile');
    await press(page, 'Enter');
    await expect(page.locator('#profiles')).toBeVisible();
    await shot(page, '08-profiles', 'en-dark-whos-watching');
    await back(page);
    await setting(page, 'Delete profile');
    await shot(page, '08-profiles', 'en-dark-delete-focused');
    await press(page, 'Enter');
    await expect(page.locator('#profile-dialog')).toBeVisible();
    await shot(page, '09-dialogs', 'en-dark-confirm');
    await press(page, 'ArrowLeft');
    await expect(page.locator('#profile-dialog-ok')).toBeFocused();
    await shot(page, '09-dialogs', 'en-dark-delete-focused');
    await back(page);
    await setting(page, 'PIN');
    await press(page, 'Enter');
    await expect(page.locator('#pin-pad')).toBeVisible();
    await shot(page, '09-dialogs', 'en-dark-pin');
    await back(page);
    await setting(page, 'Screen saver to use');
    await press(page, 'Enter');
    await expect(page.locator('#menu')).toBeVisible();
    await shot(page, '09-dialogs', 'en-dark-picker');
});

test('10 Logo saver at two phases, with extras', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-02T20:30:00') });
    const gallery = seed({ screenSaverKind: 'logo', screenSaverMs: 300000 });
    gallery.screenSaver = true;
    await boot(page, gallery);
    await page.clock.fastForward(301000);
    await expect(page.locator('#screen-saver .ss-logo-icon')).toBeVisible();
    await shot(page, '10-screen-saver', 'en-dark-logo-frame-1');
    // fastForward coalesces repeating timers; visit each two-minute step.
    for (let step = 0; step < 4; step++) await page.clock.fastForward(120000);
    await expect(page.locator('.ss-logo-extra')).toHaveCount(28);
    await page.locator('#screen-saver').evaluate(stage => stage.getAnimations({ subtree: true }).forEach(animation => { animation.pause(); animation.currentTime = 3000; }));
    await shot(page, '10-screen-saver', 'en-dark-logo-frame-2');
});

for (const variant of [
    { folder: '12-arabic', language: 'ar', theme: 'dark', accent: 'blue' },
    { folder: '13-light-theme', language: 'en', theme: 'light', accent: 'violet' },
]) {
    test(variant.folder + ' Home, menu, profile actions and appearance', async ({ page }) => {
        await boot(page, seed({ ...variant, density: 'compact' }));
        const prefix = variant.language + '-' + variant.theme + '-' + variant.accent;
        if (variant.language === 'ar') await page.locator('html').evaluate(node => { node.dir = 'rtl'; });
        await shot(page, variant.folder, prefix + '-home');
        await back(page);
        await expect(page.locator('#rail .focused')).toHaveCount(1);
        await shot(page, variant.folder, prefix + '-rail-open');
        const settingsName = await page.evaluate(() => I18n.t('rail.settings'));
        const current = await page.evaluate(() => I18n.t('profile.current'));
        await setting(page, current, settingsName);
        await press(page, 'ArrowDown');
        await shot(page, variant.folder, prefix + '-profile-actions');
        await moveTo(page, '.st-row.focused .st-label', await page.evaluate(() => I18n.t('profile.delete')));
        await expect(page.locator('.st-row.focused')).toHaveAttribute('aria-disabled', 'true');
        await shot(page, variant.folder, prefix + '-delete-disabled');
        const theme = await page.evaluate(() => I18n.t('settings.theme'));
        await setting(page, theme, settingsName);
        await shot(page, variant.folder, prefix + '-appearance');
        await press(page, 'Enter');
        await expect(page.locator('#menu')).toBeVisible();
        await shot(page, variant.folder, prefix + '-picker');
    });
}

test('08 Yellow accent keeps picture avatars clear and letter avatars filled', async ({ page }) => {
    await boot(page, seed({ accent: 'saffron' }));
    await page.evaluate(() => {
        ProfileStore.setAvatar(ProfileStore.active().id, Avatars.ids[0]);
        ProfileStore.add('Family');
    });
    await section(page, 'Home');
    await shot(page, '02-rail-menu', 'en-dark-yellow-picture-collapsed');
    await back(page);
    await press(page, 'ArrowUp');
    await shot(page, '02-rail-menu', 'en-dark-yellow-picture-open');
    await setting(page, 'Current profile');
    await shot(page, '08-profiles', 'en-dark-yellow-picture-card');
    await press(page, 'Enter');
    await expect(page.locator('#profiles')).toBeVisible();
    await shot(page, '08-profiles', 'en-dark-yellow-picture-and-letter');
    await back(page);
    await setting(page, 'Avatar');
    await press(page, 'Enter');
    await expect(page.locator('#avatar-picker')).toBeVisible();
    await shot(page, '08-profiles', 'en-dark-yellow-avatar-picker');
    await press(page, 'ArrowLeft');
    await press(page, 'Enter');
    await section(page, 'Home');
    await shot(page, '02-rail-menu', 'en-dark-yellow-letter-collapsed');
    await back(page);
    await press(page, 'ArrowUp');
    await shot(page, '02-rail-menu', 'en-dark-yellow-letter-open');
});
