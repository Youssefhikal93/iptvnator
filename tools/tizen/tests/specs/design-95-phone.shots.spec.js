const { test, expect, boot, setting, press, back, openFirst, playing } = require('./helpers');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const service = require('../../tv-app/service/phone-remote');

const output = path.join(path.resolve(process.env.DESIGN_SHOTS || path.join(__dirname, '../design-95-shots')), '11-phone-remote');
const port = Number(process.env.PHONE_TEST_PORT || 8778);
let directory;
test.beforeEach(async ({ page }) => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jotv-phone-shots-'));
    service.hooks.ip = () => '127.0.0.1';
    service.start(port, { file: path.join(directory, 'phones.json') });
    await expect.poll(() => service.port()).toBe(port);
    await page.route('http://127.0.0.1:8778/**', route => route.continue({ url: route.request().url().replace(':8778', ':' + port) }));
    fs.mkdirSync(output, { recursive: true });
});
test.afterEach(() => {
    service.stop();
    fs.rmSync(directory, { recursive: true, force: true });
});

for (const variant of [
    { name: 'en-nothing-playing-390x844', width: 390, height: 844 },
    { name: 'en-film-playing-390x844', width: 390, height: 844, film: true },
    { name: 'ar-film-playing-390x844', width: 390, height: 844, film: true, arabic: true },
    { name: 'en-film-playing-375x667', width: 375, height: 667, film: true },
]) {
    test(variant.name, async ({ page, context }) => {
        await boot(page);
        await setting(page, 'Pair a phone');
        await press(page, 'Enter');
        const phone = await context.newPage();
        await phone.setViewportSize({ width: variant.width, height: variant.height });
        await phone.goto(await page.locator('#remote-url').innerText());
        await expect(phone.locator('#linkText')).toHaveText('Connected');
        await back(page);
        await phone.locator('[data-jump="home"]').click();
        await expect(phone.locator('#title')).toHaveText('Home');
        if (variant.film) {
            await openFirst(page, 'Movies');
            await press(page, 'Enter');
            await playing(page);
            await expect(phone.locator('[data-action="speed"]')).toBeVisible();
            await expect(phone.locator('.info')).toBeVisible();
            await page.locator('#video').evaluate(video => { video.pause(); video.currentTime = 30; });
            await expect(phone.locator('#sub')).toContainText('0:30');
        } else await expect(phone.locator('.info')).toBeHidden();
        if (variant.arabic) {
            await page.evaluate(() => Prefs.set('language', 'ar'));
            await expect(phone.locator('html')).toHaveAttribute('dir', 'rtl');
        }
        await phone.evaluate(() => document.fonts.ready);
        await expect(phone.locator('.tapped')).toHaveCount(0);
        await phone.screenshot({ path: path.join(output, variant.name + '.png'), fullPage: true });
    });
}
