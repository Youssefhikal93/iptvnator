const { test, expect, boot, section, openFirst, press, sendKeyCode, back, playing, playerGroup, playerMenu, moveTo } = require('./helpers');

const SHOTS = process.env.SYNC_SHOTS;
const clock = (s) => `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')},000`;
// Twenty lines, one every 3 s, so the Choose the line list has more than a screen.
const FILE = Array.from({ length: 20 }, (_, n) => `${n + 1}\n${clock(n * 3 + 1)} --> ${clock(n * 3 + 3)}\nLine ${n + 1}: where were you last night?\n`).join('\n');
const LABELS = {
    en: { movies: 'Movies', subtitles: 'Subtitles', find: 'Find subtitles online…', timing: 'Subtitle timing', sync: 'Sync subtitles', choose: 'Choose the line…' },
    ar: { movies: 'الأفلام', subtitles: 'الترجمات', find: 'ابحث عن ترجمات على الإنترنت…', timing: 'توقيت الترجمة', sync: 'مزامنة الترجمة', choose: 'اختر السطر…' },
};

async function subtitle(page, language = 'en') {
    const t = LABELS[language];
    await page.route('https://api.opensubtitles.com/**', (route) => {
        if (route.request().url().includes('/download')) return route.fulfill({ json: { link: 'https://files.test/os.srt', remaining: 90 } });
        return route.fulfill({ json: { data: [{ attributes: { language: 'en', release: 'Fixture.2021.1080p.WEB-GRP', files: [{ file_id: 11 }] } }] } });
    });
    await page.route('https://files.test/**', (route) => route.fulfill({ body: FILE }));
    await boot(page, { storage: { 'shared-settings': { opensubtitlesApiKey: 'test-key' }, settings: { language } } });
    if (language === 'en') await openFirst(page, t.movies);
    else {
        // section() waits for the list only for the English names.
        await section(page, t.movies);
        await expect(page.locator('#items .row, #items .card').first()).toBeVisible();
        await expect(page.locator('#items .skeleton')).toHaveCount(0);
        await press(page, 'ArrowRight');
        await press(page, 'Enter');
        await expect(page.locator('#detail')).toBeVisible();
    }
    await press(page, 'Enter');
    await playing(page);
    await playerMenu(page);
    await playerGroup(page, t.subtitles);
    await moveTo(page, '#pl-menu .pl-menu-item.focus span:last-child', t.find);
    await press(page, 'Enter');
    await press(page, 'Enter');
    await expect(page.locator('#pl-subs')).not.toHaveText('', { timeout: 10000 });
    return t;
}

async function timingRow(page, t, label) {
    await playerMenu(page);
    await playerGroup(page, t.timing);
    await moveTo(page, '#pl-menu .pl-menu-item.focus span:last-child', label);
    await press(page, 'Enter');
}

const bar = (page) => page.locator('#pl-sync');

test('Sync subtitles: the next line waits for OK, ◀ ▶ fine-tune while it plays, OK keeps and the delay shows in the menu', async ({ page }) => {
    const t = await subtitle(page);
    await timingRow(page, t, t.sync);
    await expect(bar(page)).toBeVisible();
    await expect(page.locator('#pl-menu')).toBeHidden();
    await expect(page.locator('#pl-controls')).toBeHidden();
    await expect(bar(page).locator('.sync-ask')).toHaveText('Press OK when you hear:');
    await expect(bar(page).locator('.sync-target')).toContainText('where were you last night?');
    await expect(bar(page).locator('.sync-keys')).toContainText('OK: now');
    if (SHOTS) await page.screenshot({ path: SHOTS + '/1-press-ok-when-you-hear.png' });
    await press(page, 'Enter');
    await expect(bar(page).locator('.sync-ask')).toHaveText('Moved. Fine-tune while you watch:');
    const moved = await bar(page).locator('.sync-shift').innerText();
    await press(page, 'ArrowRight');
    await expect(bar(page).locator('.sync-shift')).not.toHaveText(moved);
    // The video keeps playing under the bar.
    await expect.poll(() => page.locator('#video').evaluate((v) => !v.paused)).toBe(true);
    if (SHOTS) await page.screenshot({ path: SHOTS + '/2-fine-tune.png' });
    await press(page, 'Enter');
    await expect(bar(page)).toBeHidden();
    await playerMenu(page);
    await expect(page.locator('#pl-menu .pl-menu-item').filter({ hasText: t.timing })).toContainText(/[+−]\d+\.\d s/);
});

test('Choose the line lists every line, pages with CH, and plays from just before the chosen one; Return saves nothing', async ({ page }) => {
    const t = await subtitle(page);
    await timingRow(page, t, t.choose);
    await expect(bar(page).locator('.sync-line')).not.toHaveCount(0);
    await expect.poll(() => page.locator('#video').evaluate((v) => v.paused)).toBe(true);
    for (let i = 0; i < 4; i++) await press(page, 'ArrowDown');
    await sendKeyCode(page, 428);
    const chosen = await bar(page).locator('.sync-line.focus').innerText();
    if (SHOTS) await page.screenshot({ path: SHOTS + '/3-choose-the-line.png' });
    await press(page, 'Enter');
    await expect(bar(page).locator('.sync-target')).toHaveText(chosen);
    await expect.poll(() => page.locator('#video').evaluate((v) => !v.paused)).toBe(true);
    await back(page);
    await expect(bar(page)).toBeHidden();
    await playerMenu(page);
    await expect(page.locator('#pl-menu .pl-menu-item').filter({ hasText: t.timing })).toContainText('No delay');
});

test('the sync bar reads right to left in Arabic', async ({ page }) => {
    const t = await subtitle(page, 'ar');
    await timingRow(page, t, t.sync);
    await expect(bar(page)).toBeVisible();
    await expect(bar(page)).toHaveCSS('direction', 'rtl');
    await expect(bar(page).locator('.sync-ask')).toHaveText('اضغط OK عندما تسمع:');
    if (SHOTS) await page.screenshot({ path: SHOTS + '/4-arabic.png' });
});
