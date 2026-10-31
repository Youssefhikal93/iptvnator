const { test, expect, boot, setting, choose, openFirst, press, playing, playerMenu } = require('./helpers');

const themes = [
    ['dark', 'Dark blue', '#0d0f12'],
    ['black', 'Dark black', '#000000'],
    ['grey', 'Dark grey', '#121212'],
    ['light', 'Light', '#eef0f3'],
];

for (const language of ['en', 'ar']) {
    for (const density of ['comfortable', 'compact']) {
        test(`four theme pills fit and switch in ${language}, ${density}`, async ({ page }) => {
            await boot(page, { storage: { settings: { language, density } } });
            await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
            expect(await page.locator('html').evaluate(node => getComputedStyle(node).getPropertyValue('--shell-bg').trim())).toBe('#0d0f12');
            await setting(page, language === 'ar' ? 'السمة البصرية' : 'Theme', language === 'ar' ? 'الإعدادات' : 'Settings');
            const labels = language === 'ar' ? ['داكن أزرق', 'داكن أسود', 'داكن رمادي', 'فاتح'] : themes.map(theme => theme[1]);
            const row = page.locator('.st-row.focused');
            await expect(row.locator('.st-pill')).toHaveText(labels);
            // The app sets lang only; exercise Arabic geometry in RTL as well.
            if (language === 'ar') await page.locator('html').evaluate(node => { node.dir = 'rtl'; });
            for (const [index, [theme, , shell]] of themes.entries()) {
                await choose(page, labels[index]);
                await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
                await expect(row.locator('.st-pill.on')).toHaveText(labels[index]);
                expect(await page.locator('html').evaluate(node => getComputedStyle(node).getPropertyValue('--shell-bg').trim())).toBe(shell);
                const fit = await row.evaluate(node => {
                    const bounds = node.getBoundingClientRect();
                    const pills = [...node.querySelectorAll('.st-pill')].map(pill => pill.getBoundingClientRect());
                    const label = node.querySelector('.st-label');
                    return {
                        singleLine: pills.every(pill => Math.abs(pill.top - pills[0].top) < 1),
                        inside: pills.every(pill => pill.left >= bounds.left && pill.right <= bounds.right && pill.top >= bounds.top && pill.bottom <= bounds.bottom),
                        labelFits: label.scrollWidth <= label.clientWidth,
                        textFits: [...node.querySelectorAll('.st-pill span')].every(span => span.getClientRects().length === 1 && span.scrollWidth <= span.clientWidth),
                    };
                });
                expect(fit).toEqual({ singleLine: true, inside: true, labelFits: true, textFits: true });
                await page.reload();
                await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
                await setting(page, language === 'ar' ? 'السمة البصرية' : 'Theme', language === 'ar' ? 'الإعدادات' : 'Settings');
                if (language === 'ar') await page.locator('html').evaluate(node => { node.dir = 'rtl'; });
            }
        });
    }
}

for (const theme of ['black', 'grey']) {
    test(`${theme} player menu keeps Dark blue surfaces and the active accent`, async ({ page }) => {
        await boot(page, { storage: { settings: { theme, accent: 'saffron' } } });
        await openFirst(page, 'Movies');
        await press(page, 'Enter');
        await playing(page);
        await playerMenu(page);
        const palette = await page.locator('#pl-menu').evaluate(node => {
            const css = getComputedStyle(node);
            return ['--shell-bg', '--panel-bg', '--selection'].map(token => css.getPropertyValue(token).trim());
        });
        expect(palette).toEqual(['#0d0f12', '#171b25', '#f1bc50']);
        await expect(page.locator('#pl-menu')).toHaveCSS('background-color', 'rgb(14, 17, 24)');
    });
}
