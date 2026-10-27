const { test, expect, boot, section, press, back, moveTo, openFirst, setting } = require('./helpers');

const RAIL_GERMAN = ['Startseite', 'Live-TV', 'Filme', 'Serien', 'Einstellungen'];
const RAIL_ENGLISH = ['Home', 'Live TV', 'Movies', 'Series', 'Settings'];

const railLabels = page => page.locator('#rail .rail-item').allTextContents().then(list => list.map(text => text.trim()));

// Opens the Language list from the Settings row and picks a language by its own name.
async function pickLanguage(page, name, key = 'ArrowDown') {
    await press(page, 'Enter');
    await expect(page.locator('#menu')).toBeVisible();
    await moveTo(page, '#menu .focused', name, key);
    await press(page, 'Enter');
    await expect(page.locator('#menu')).toBeHidden();
}

async function backToRail(page) {
    for (let i = 0; i < 12 && !await page.locator('#rail .focused').count(); i++) await back(page);
    await expect(page.locator('#rail .focused')).toHaveCount(1);
}

function luminance([r, g, b]) {
    const channel = value => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

// The outer box-shadow ring is opaque and separate from the surface gap.
async function focusContrast(page, selector) {
    return page.evaluate(({ selector }) => {
        const parse = text => (text.match(/[\d.]+/g) || []).map(Number);
        const node = document.querySelector(selector);
        const style = getComputedStyle(node);
        const colours = style.boxShadow.match(/rgba?\([^)]+\)/g);
        const border = parse(colours[1]);
        const surface = parse(getComputedStyle(node.parentElement).backgroundColor);
        const base = surface.length ? surface : parse(getComputedStyle(document.body).backgroundColor);
        const alpha = border.length > 3 ? border[3] : 1;
        const mixed = [0, 1, 2].map(i => Math.round(border[i] * alpha + base[i] * (1 - alpha)));
        return { mixed, base: base.slice(0, 3), alpha };
    }, { selector });
}

test('Settings language list switches the app to Deutsch, survives a reload and back to English restores it', async ({ page }) => {
    await boot(page);
    expect(await railLabels(page)).toEqual(RAIL_ENGLISH);
    await setting(page, 'Language');
    await expect(page.locator('.st-row .st-label', { hasText: /^Language$/ })).toBeVisible();
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('English');

    await pickLanguage(page, 'Deutsch');
    expect(await railLabels(page)).toEqual(RAIL_GERMAN);
    await expect(page.locator('.st-row.focused .st-label')).toHaveText('Sprache');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('Deutsch');
    await expect(page.locator('.st-title')).toHaveText('Einstellungen');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    // Static HTML (the add-source form) follows too, and values such as Off.
    await expect(page.locator('#form-save')).toHaveText('Speichern');
    await expect(page.locator('#form-user').locator('xpath=preceding-sibling::label')).toHaveText('Nutzername');
    await expect(page.locator('.st-group', { hasText: 'Darstellung' })).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('iptvnator-tv:p:default:settings')).language);
    expect(stored).toBe('de');

    await page.reload();
    await expect(page.locator('#rail .rail-item')).toHaveCount(6);
    expect(await railLabels(page)).toEqual(RAIL_GERMAN);
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');

    await backToRail(page);
    await setting(page, 'Sprache', 'Einstellungen');
    await pickLanguage(page, 'English', 'ArrowUp');
    expect(await railLabels(page)).toEqual(RAIL_ENGLISH);
    await expect(page.locator('.st-row.focused .st-label')).toHaveText('Language');
    await expect(page.locator('#form-save')).toHaveText('Save');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('the Language list offers the desktop languages by their own names, current one first selected', async ({ page }) => {
    await boot(page);
    await setting(page, 'Language');
    await press(page, 'Enter');
    const names = (await page.locator('#menu .menu-row').allTextContents()).map(text => text.replace('✓ ', ''));
    expect(names.slice(0, 2)).toEqual(['English', 'العربية']);
    for (const name of ['Deutsch', 'Français', 'Español', '日本語', 'Русский']) expect(names).toContain(name);
    expect(names).toHaveLength(20);
    await expect(page.locator('#menu .focused')).toHaveText('✓ English');
    // A long list scrolls inside the dialog instead of running off the screen.
    const box = await page.locator('#menu').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(1080);
});

test('a key a language lacks falls back to English, and an unknown key shows itself', async ({ page }) => {
    await boot(page);
    const result = await page.evaluate(() => {
        I18n.tables.en['spec.onlyEnglish'] = 'Only in English';
        I18n.setLanguage('de');
        const texts = [I18n.t('spec.onlyEnglish'), I18n.t('rail.home'), I18n.t('spec.nowhere')];
        I18n.setLanguage('en');
        return texts;
    });
    expect(result).toEqual(['Only in English', 'Startseite', 'spec.nowhere']);
});

test('Light theme sets data-theme, changes the background, keeps a visible focus and survives a reload', async ({ page }) => {
    await boot(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await setting(page, 'Theme');
    await expect(page.locator('.st-row.focused .st-pill.on')).toHaveText('Dark');
    const darkFocus = await focusContrast(page, '.st-row.focused');
    expect(contrast(darkFocus.mixed, darkFocus.base)).toBeGreaterThanOrEqual(4.5);

    await press(page, 'Enter');
    await expect(page.locator('.st-row.focused .st-pill.on')).toHaveText('Light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(light).not.toBe(dark);
    expect(dark).toBe('rgb(13, 15, 18)');
    expect(light).toBe('rgb(238, 240, 243)');

    // Focus uses a 4 px surface gap and an 8 px outer ring in both themes.
    const style = await page.locator('.st-row.focused').evaluate(node => {
        const css = getComputedStyle(node);
        return { shadow: css.boxShadow };
    });
    expect(style.shadow).toContain('0px 0px 0px 4px');
    expect(style.shadow).toContain('0px 0px 0px 8px');
    const lightFocus = await focusContrast(page, '.st-row.focused');
    expect(contrast(lightFocus.mixed, lightFocus.base)).toBeGreaterThanOrEqual(4.5);

    // The rail uses the same shared ring.
    await backToRail(page);
    const ring = await page.locator('#rail .rail-item.focused').evaluate(node => {
        const css = getComputedStyle(node);
        return { shadow: css.boxShadow, outline: css.outlineStyle, border: css.borderTopColor };
    });
    expect(ring.shadow !== 'none' || ring.outline !== 'none').toBe(true);

    await page.reload();
    await expect(page.locator('#rail .rail-item')).toHaveCount(6);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(238, 240, 243)');

    // Back to Dark restores the original colours.
    await setting(page, 'Theme');
    await press(page, 'Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(dark);
});

test('the player keeps its dark palette in the Light theme', async ({ page }) => {
    await boot(page, { storage: { settings: { theme: 'light' } } });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const colours = await page.evaluate(() => ({
        player: getComputedStyle(document.getElementById('player')).getPropertyValue('--shell-bg').trim(),
        page: getComputedStyle(document.documentElement).getPropertyValue('--shell-bg').trim(),
    }));
    expect(colours.player).toBe('#0d0f12');
    expect(colours.page).toBe('#eef0f3');
});

test('Animations Off stops artwork fades and focus growth, and survives a reload', async ({ page }) => {
    await boot(page);
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
    await openFirst(page, 'Movies');
    await expect(page.locator('#detail .dt-poster')).toHaveClass(/art-in/);
    await back(page);
    await setting(page, 'Animations');
    await expect(page.locator('.st-row.focused .st-pill.on')).toHaveText('On');
    await press(page, 'Enter');
    await expect(page.locator('.st-row.focused .st-pill.on')).toHaveText('Off');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
});
