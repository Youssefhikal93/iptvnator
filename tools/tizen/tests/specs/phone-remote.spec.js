const { test, expect, boot, setting, press, back, openFirst, playing, section, enterItems, holdOK, moveTo } = require('./helpers');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const service = require('../../tv-app/service/phone-remote');
let dir;
const PORT = Number(process.env.PHONE_TEST_PORT || 8778);
const BASE = 'http://127.0.0.1:' + PORT;
async function app(route, body) {
    const response = await fetch(BASE + route, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined });
    return response.json();
}

test.beforeEach(async ({ page }) => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jotv-phone-e2e-'));
    service.hooks.ip = () => '127.0.0.1';
    service.start(PORT, { file: path.join(dir, 'phones.json') });
    await expect.poll(() => service.port()).toBe(PORT);
    await page.route('http://127.0.0.1:8778/**', route => route.continue({ url: route.request().url().replace('http://127.0.0.1:8778', BASE) }));
});
test.afterEach(async () => {
    service.stop();
    fs.rmSync(dir, { recursive: true, force: true });
});
async function pair(page, context) {
    await boot(page);
    await setting(page, 'Pair a phone');
    await expect(page.locator('#settings .st-section:not(.hidden) .st-part').first()).toHaveText('Phone remote');
    await press(page, 'Enter');
    const address = page.locator('#remote-url');
    await expect(address).toHaveText(new RegExp(':' + PORT + '/r/[A-HJ-NP-Z2-9]{6}$'));
    await expect(page.locator('#remote-pair')).toContainText('home screen');
    const phone = await context.newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.goto(await address.innerText());
    await expect(phone.locator('#linkText')).toHaveText('Connected');
    await expect(page.locator('#remote-pair p')).toContainText('1 of 5');
    await back(page);
    return phone;
}

async function expectCompactRemote(phone, height) {
    await expect.poll(() => phone.locator('.back').evaluate(node => getComputedStyle(node).scale)).toMatch(/^(none|1)$/);
    const layout = await phone.evaluate(() => {
        const box = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
        return { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
            card: box('#card'), pad: box('.dpad'), back: box('.back'), volume: box('.volume'), jumps: box('.jumps') };
    });
    expect(layout.width).toBeLessThanOrEqual(phone.viewportSize().width);
    expect(layout.height).toBeLessThanOrEqual(height + (height === 667 ? 48 : 0));
    expect(layout.card.height).toBeLessThanOrEqual(76);
    expect(layout.back.width).toBeGreaterThanOrEqual(100);
    expect(layout.back.height).toBeGreaterThanOrEqual(56);
    expect(layout.back.y).toBeGreaterThanOrEqual(layout.pad.bottom);
    expect(layout.back.right).toBeLessThan(layout.volume.x);
    expect(layout.back.y).toBe(layout.volume.y);
    expect(layout.jumps.bottom).toBeLessThanOrEqual(height + (height === 667 ? 48 : 0));
}

test('phone controls fit one screen, with playback-only Info and physical Back/volume order (#95)', async ({ page, context }) => {
    const phone = await pair(page, context);
    await phone.locator('[data-jump="home"]').click();
    await expect(phone.locator('#title')).toHaveText('Home');
    await expect(phone.locator('#sub')).toHaveText('Nothing playing');
    await expect(phone.getByRole('button', { name: 'Info', exact: true })).toHaveCount(0);
    await expectCompactRemote(phone, 844);
    await phone.setViewportSize({ width: 375, height: 667 });
    await expectCompactRemote(phone, 667);
    // The fake film has fewer tracks: exercise the full supported action set
    // at the TV/service boundary as well as the real playback controls below.
    await page.route('http://127.0.0.1:8778/app/state', async route => {
        const state = route.request().postDataJSON();
        if (state.playing) state.actions = [
            { id: 'subtitles', label: 'Subtitles' }, { id: 'audio', label: 'Audio' },
            { id: 'sync', label: 'Subtitle sync' }, { id: 'speed', label: 'Playback speed' },
        ];
        await route.continue({ url: route.request().url().replace('http://127.0.0.1:8778', BASE), postData: JSON.stringify(state) });
    });
    await openFirst(page, 'Movies');
    await expect(phone.locator('[data-action="play"]')).toBeVisible();
    await expect(phone.locator('.info')).toBeHidden();
    await phone.locator('[data-action="play"]').click();
    await playing(page);
    await expect(phone.locator('.info')).toBeVisible();
    await expect(phone.locator('#context button')).toHaveCount(4);
    await expectCompactRemote(phone, 667);
    await phone.setViewportSize({ width: 390, height: 844 });
    await expectCompactRemote(phone, 844);
    await phone.locator('.info').click();
    await expect(page.locator('#pl-menu')).toBeVisible();
    await phone.locator('.back').click();
    await page.evaluate(() => Prefs.set('language', 'ar'));
    await expect(phone.locator('html')).toHaveAttribute('dir', 'rtl');
    await expectCompactRemote(phone, 844);
    await phone.locator('[data-jump="home"]').click();
    await expect(phone.locator('.info')).toBeHidden();
});

test('touch feedback flashes without delaying keys and preserves OK down/up phases (#95)', async ({ page, browser }) => {
    const touchContext = await browser.newContext({ hasTouch: true, isMobile: true });
    try {
        const phone = await pair(page, touchContext);
        await phone.locator('[data-jump="home"]').tap();
        await expect(page.locator('#content')).toHaveClass(/home/);
        const up = phone.getByRole('button', { name: 'Up', exact: true });
        const sent = phone.waitForRequest(request => request.url().endsWith('/command') && request.postDataJSON().code === 38);
        await up.tap();
        await expect(up).toHaveClass(/tapped/);
        expect((await sent).postDataJSON()).toEqual({ type: 'key', code: 38 });
        await expect(up).not.toHaveClass(/tapped/);
        await openFirst(page, 'Movies');
        const play = phone.locator('[data-action="play"]');
        await expect(play).toBeVisible();
        await play.tap();
        await playing(page);
        await phone.locator('.info').tap();
        await expect(page.locator('#pl-menu')).toBeVisible();
        await phone.locator('.back').tap();
        await expect(page.locator('#pl-menu')).toBeHidden();
        const ok = phone.locator('#ok');
        const phases = [];
        phone.on('request', request => {
            if (request.url().endsWith('/command') && request.postDataJSON().code === 13) phases.push(request.postDataJSON().phase);
        });
        const bounds = await ok.boundingBox();
        await phone.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await expect(ok).toHaveClass(/tapped/);
        await expect(ok).not.toHaveClass(/tapped/);
        await expect.poll(() => phases).toEqual(['down', 'up']);
    } finally { await touchContext.close(); }
});

test('pair from Settings, D-pad follows TV focus, Search types on TV, More and bookmarks work (#93)', async ({ page, context }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const phone = await pair(page, context);
    phone.on('pageerror', error => errors.push(error.message));
    await phone.locator('[data-jump="home"]').click();
    await expect(page.locator('#content')).toHaveClass(/home/);
    await phone.locator('[data-jump="movies"]').click();
    await expect(page.locator('#categories .focused')).toHaveCount(1);
    const before = await page.locator('#categories .focused').innerText();
    await phone.getByRole('button', { name: 'Down', exact: true }).click();
    await expect(page.locator('#categories .focused')).not.toHaveText(before);
    await phone.locator('[data-jump="search"]').click();
    await expect(page.locator('#search-input')).toBeFocused();
    await expect(phone.locator('#text')).toBeVisible();
    await phone.locator('#text').fill('Movie 12');
    await expect(page.locator('#search-input')).toHaveValue('Movie 12');
    await phone.locator('#text-done').click();
    await expect(phone.locator('#text')).toBeHidden();
    await phone.locator('[data-jump="more"]').click();
    await expect(phone.locator('.sheet')).toBeVisible();
    await expect(phone.locator('.num')).toHaveCount(12);
    await expect(phone.locator('.color')).toHaveCount(4);
    await phone.locator('.scrim').click({ position: { x: 10, y: 10 } });
    await phone.reload();
    await expect(phone.locator('#linkText')).toHaveText('Connected');
    const again = await app('/app/pair', {});
    await phone.goto(again.url);
    await expect(phone.locator('#linkText')).toHaveText('Connected');
    expect((await app('/app/phones')).length).toBe(1);
    expect(errors).toEqual([]);
});

test('episode actions, intro availability and seek steps follow playback; other screens hide seeking', async ({ page, context }) => {
    const phone = await pair(page, context);
    await openFirst(page, 'Series');
    await press(page, 'Enter');
    await playing(page);
    await expect(phone.locator('#context [data-action="next"]')).toHaveText('Next episode');
    await expect(phone.locator('#context [data-action="skip"]')).toHaveCount(0);
    await expect(phone.locator('.seekrow')).toBeVisible();
    await page.locator('#video').evaluate(video => { video.pause(); video.currentTime = 30; });
    await phone.locator('.seekrow button').last().click();
    await expect.poll(() => page.locator('#video').evaluate(video => video.currentTime)).toBeGreaterThanOrEqual(39);
    await phone.locator('.seekrow button').first().click();
    await expect.poll(() => page.locator('#video').evaluate(video => video.currentTime)).toBeLessThan(32);
    await phone.locator('[data-action="next"]').click();
    await expect(page.locator('#pl-subtitle')).toContainText('S1 E2');
    await phone.locator('[data-jump="home"]').click();
    await expect(phone.locator('.seekrow')).toBeHidden();
    await expect(phone.locator('#context button')).toHaveCount(0);
});

test('Favourites uses the current section and defaults to channels elsewhere', async ({ page, context }) => {
    const phone = await pair(page, context);
    for (const target of ['live', 'movies', 'series', 'home']) {
        await phone.locator('[data-jump="' + target + '"]').click();
        await expect(phone.locator('[data-jump="' + target + '"]')).toHaveClass(/on/);
        await phone.locator('[data-jump="favs"]').click();
        await expect(page.locator('#categories .focused')).toContainText('Favorites');
        await expect(page.locator('#items .list-header')).toContainText('Favorites');
        await expect(page.locator('#rail .active')).toContainText(target === 'home' || target === 'live' ? 'Live TV' : target === 'movies' ? 'Movies' : 'Series');
    }
});

test('TV text fields open phone entry; theme accent and Arabic follow TV settings', async ({ page, context }) => {
    const phone = await pair(page, context);
    await page.evaluate(() => ProfileDialog.open({ title: 'Name', value: 'Kitchen' }));
    await expect(phone.locator('#text')).toHaveValue('Kitchen');
    await phone.locator('#text').fill('Bedroom');
    await expect(page.locator('#profile-name')).toHaveValue('Bedroom');
    await page.evaluate(() => { Prefs.set('accent', 'saffron'); Prefs.set('language', 'ar'); });
    await expect(phone.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(phone.locator('html')).toHaveAttribute('data-accent', 'saffron');
    await expect(phone.locator('.dpad .down')).toHaveAttribute('aria-label', await page.evaluate(() => I18n.t('remote.down')));
    expect(await phone.locator('.dpad').evaluate(node => getComputedStyle(node.parentElement).direction)).toBe('ltr');
});

test('#96 the channel name dialog accepts phone text beyond profile-name length', async ({ page, context }) => {
    const phone = await pair(page, context);
    await section(page, 'Live TV');
    await enterItems(page);
    await holdOK(page);
    await moveTo(page, '#menu .focused', 'Edit channel');
    await press(page, 'Enter');
    await press(page, 'Enter');
    await expect(phone.locator('#text')).toHaveValue('Channel 1 (cat all)');
    const name = 'Weekend sports with the family';
    await phone.locator('#text').fill(name);
    await expect(page.locator('#profile-name')).toHaveValue(name);
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#items .focused .label')).toContainText(name);
    await page.reload();
    await section(page, 'Live TV');
    await expect(page.locator('#items')).toContainText(name);
});

test('rename and Forget in Settings revoke a phone immediately', async ({ page, context }) => {
    const phone = await pair(page, context);
    const phones = await app('/app/phones');
    await setting(page, phones[0].name);
    await expect(page.locator('.st-action-pill.focus')).toHaveText('Rename');
    await expect(page.locator('.st-row.focused [data-icon="phone"] svg')).toHaveCount(1);
    const forgetAll = page.locator('.st-standalone-action');
    expect((await forgetAll.boundingBox()).width).toBeLessThan(600);
    const idleSurface = await page.locator('.st-row.focused').evaluate(node => getComputedStyle(node).backgroundColor);
    await expect(forgetAll).toHaveCSS('background-color', idleSurface);
    await press(page, 'Enter');
    await page.locator('#profile-name').fill('Kitchen');
    await page.locator('#profile-dialog-ok').click();
    await expect(page.locator('#settings')).toContainText('Kitchen');
    await setting(page, 'Kitchen');
    await press(page, 'ArrowRight');
    await expect(page.locator('.st-action-pill.focus')).toHaveText('Forget');
    await expect(page.locator('.st-action-pill.focus')).toHaveCSS('background-color', 'rgb(179, 38, 30)');
    await expect(page.locator('.st-action-pill.focus')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await press(page, 'ArrowLeft');
    await expect(page.locator('.st-action-pill.focus')).toHaveText('Rename');
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(phone.locator('.closed p')).toContainText('not paired');
    await expect.poll(async () => (await app('/app/phones')).length).toBe(0);
});

test('five simultaneous phones are allowed, sixth pairing is refused with instructions', async ({ page, context, browser }) => {
    const first = await pair(page, context);
    for (let n = 1; n < 5; n++) {
        const code = await app('/app/pair', {});
        const paired = await app('/pair', { code: code.code, name: 'Phone ' + n });
        expect(paired.status).toBe(200);
    }
    const code = await app('/app/pair', {});
    const sixthContext = await browser.newContext();
    try {
        const sixth = await sixthContext.newPage();
        await sixth.goto(code.url);
        await expect(sixth.locator('.closed p')).toHaveText('5 phones paired, forget one in Settings');
        await expect(first.locator('#linkText')).toHaveText('Connected');
    } finally { await sixthContext.close(); }
});

test('closed page retries and reconnects after Jotv restarts with its saved pairing', async ({ page, context }) => {
    const phone = await pair(page, context);
    await page.close();
    service.stop();
    await expect(phone.locator('.closed h2')).toHaveText('Jotv is closed.');
    await expect(phone.locator('.closed p')).toHaveText('Open Jotv on the TV with its remote. This page connects by itself.');
    service.start(PORT, { file: path.join(dir, 'phones.json') });
    await expect.poll(() => service.port()).toBe(PORT);
    const reopened = await context.newPage();
    await reopened.route('http://127.0.0.1:8778/**', route => route.continue({ url: route.request().url().replace('http://127.0.0.1:8778', BASE) }));
    await boot(reopened);
    await expect(phone.locator('#linkText')).toHaveText('Connected', { timeout: 6000 });
});

test('film and detail actions reuse TV controls, and live playback never offers seeking', async ({ page, context }) => {
    const phone = await pair(page, context);
    await openFirst(page, 'Movies');
    await expect(phone.locator('[data-action="play"]')).toHaveText('Play');
    await expect(phone.locator('[data-action="favourite"]')).toBeVisible();
    await phone.locator('[data-action="play"]').click();
    await playing(page);
    await expect(phone.locator('[data-action="speed"]')).toBeVisible();
    await expect(phone.locator('[data-action="subtitles"]')).toBeVisible();
    await expect(phone.locator('[data-action="next"]')).toHaveCount(0);
    await phone.locator('[data-action="speed"]').click();
    await expect(page.locator('#pl-menu .pl-menu-title')).toContainText('Playback speed');
    await phone.getByRole('button', { name: 'Back', exact: true }).click();
    await phone.getByRole('button', { name: 'Back', exact: true }).click();
    await phone.locator('[data-jump="live"]').click();
    await expect(page.locator('#items .row').first()).toContainText('Channel');
    await expect(page.locator('#categories .focused')).toHaveCount(1);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await playing(page);
    await expect(phone.locator('.seekrow')).toBeHidden();
    await expect(phone.locator('[data-action="channels"]')).toBeVisible();
    await expect(phone.locator('[data-action="next"]')).toHaveCount(0);
    await phone.locator('[data-action="channels"]').click();
    await expect(page.locator('#pl-channels')).toBeVisible();
    await phone.getByRole('button', { name: 'Back', exact: true }).click();
    await phone.locator('#ok').hover();
    await phone.mouse.down();
    await phone.waitForTimeout(800);
    await phone.mouse.up();
    await expect(page.locator('#pl-menu')).toBeVisible();
});

test('a screen saver offers Wake TV and returns to the same screen', async ({ page, context }) => {
    const phone = await pair(page, context);
    await phone.locator('[data-jump="home"]').click();
    await expect(page.locator('#content')).toHaveClass(/home/);
    await page.clock.install();
    await page.evaluate(() => Prefs.set('screenSaverMs', 300000));
    await page.clock.fastForward(300100);
    await expect(page.locator('#screen-saver')).toBeVisible();
    await expect(phone.locator('[data-action="wake"]')).toHaveText('Wake TV');
    await phone.locator('[data-action="wake"]').click();
    await expect(page.locator('#screen-saver')).toHaveCount(0);
    await expect(page.locator('#content')).toHaveClass(/home/);
});

test('phone volume shows a level bar on the TV, then hides it', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => VolumeOsd.show(35, false));
    const osd = page.locator('#volume-osd');
    await expect(osd).toHaveClass(/on/);
    await expect(osd.locator('b')).toHaveText('35');
    await expect(osd.locator('.fill')).toHaveAttribute('style', /width: 35%/);
    await page.evaluate(() => VolumeOsd.show(35, true));
    await expect(osd).toHaveClass(/muted/);
    await expect(osd).not.toHaveClass(/on/, { timeout: 4000 });
});

test('a home-screen copy with its own storage stays paired, and an unpaired page takes a typed code', async ({ page, context, browser }) => {
    const phone = await pair(page, context);
    const saved = phone.url();
    expect(saved).toMatch(/#k=[0-9a-f]{64}$/);
    // An iPhone home-screen app starts from the saved address with empty storage.
    const home = await (await browser.newContext()).newPage();
    await home.goto(saved);
    await expect(home.locator('#linkText')).toHaveText('Connected');
    const fresh = await (await browser.newContext()).newPage();
    await fresh.goto(BASE + '/');
    await expect(fresh.locator('#code')).toBeVisible();
    await setting(page, 'Pair a phone');
    await press(page, 'Enter');
    await expect(page.locator('#remote-url')).toHaveText(/\/r\/[A-Z0-9]{6}$/);
    const code = (await page.locator('#remote-url').innerText()).slice(-6);
    await fresh.locator('#code').fill(code.toLowerCase());
    await fresh.locator('#code-go').click();
    await expect(fresh.locator('#linkText')).toHaveText('Connected');
    await expect(fresh.locator('#code')).toBeHidden();
    expect(fresh.url()).toMatch(/#k=[0-9a-f]{64}$/);
});

test('a home-screen address with an old key keeps the pairing typed in later', async ({ page, browser }) => {
    await boot(page);
    // The icon was added before the TV forgot it (a reinstall): its address has an old key.
    const icon = BASE + '/#k=' + 'a'.repeat(64);
    const home = await (await browser.newContext()).newPage();
    await home.goto(icon);
    await expect(home.locator('#code')).toBeVisible();
    await setting(page, 'Pair a phone');
    await press(page, 'Enter');
    await expect(page.locator('#remote-url')).toHaveText(/\/r\/[A-Z0-9]{6}$/);
    await home.locator('#code').fill((await page.locator('#remote-url').innerText()).slice(-6));
    await home.locator('#code-go').click();
    await expect(home.locator('#linkText')).toHaveText('Connected');
    // Opening the icon again starts from the same old address.
    await home.goto('about:blank');
    await home.goto(icon);
    await expect(home.locator('#linkText')).toHaveText('Connected');
    await expect(home.locator('#code')).toBeHidden();
});
