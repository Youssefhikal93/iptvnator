const { test, expect, boot, setting, press, back } = require('./helpers');

for (const language of ['en', 'ar']) {
    for (const density of ['comfortable', 'compact']) {
        const theme = density === 'compact' ? 'light' : 'dark';
        test(`#95 profile pills remain aligned and remote actions work in ${language}, ${density}, ${theme}`, async ({ page }) => {
            await boot(page, { storage: { settings: { language, density, theme } } });
            const idleRail = page.locator('#rail .rail-item:not(.active):not(.focused)');
            expect(await idleRail.evaluateAll(nodes => nodes.every(node => getComputedStyle(node).backgroundColor === 'rgba(0, 0, 0, 0)'))).toBe(true);
            const labels = await page.evaluate(() => ({
                settings: I18n.t('rail.settings'), avatar: I18n.t('profile.avatar'),
                rename: I18n.t('profile.renameMenu'), add: I18n.t('profile.addMenu'), remove: I18n.t('profile.delete'),
            }));
            await setting(page, labels.avatar, labels.settings);
            if (language === 'ar') {
                await expect(page.locator('.st-section:visible .st-group')).toHaveText('الملفات الشخصية');
                expect([labels.avatar, labels.rename, labels.add, labels.remove]).toEqual(['الصورة الشخصية', 'إعادة التسمية…', 'إضافة ملف شخصي…', 'حذف الملف الشخصي']);
                await expect(page.locator('.st-section:visible')).toContainText('السؤال عمّن يشاهد عند البدء');
            }
            const actions = page.locator('.st-profile-actions .st-row');
            await expect(actions.locator('.st-label')).toHaveText([labels.avatar, labels.rename, labels.add, labels.remove]);
            const fit = await actions.evaluateAll(nodes => {
                const boxes = nodes.map(node => node.getBoundingClientRect());
                return boxes.every(box => Math.abs(box.y - boxes[0].y) < 3 && Math.abs(box.height - boxes[0].height) < 3 && box.left >= 0 && box.right <= 1920) &&
                    nodes.every(node => { const label = node.querySelector('.st-label'); return label.scrollWidth <= label.clientWidth; });
            });
            expect(fit).toBe(true);
            const remove = actions.last();
            await expect(remove).toHaveAttribute('aria-disabled', 'true');
            await expect(page.locator('.st-action-hint')).not.toBeEmpty();
            await expect(remove.locator('.st-value')).toHaveCount(0);
            await expect(actions.locator('.menu-icon svg')).toHaveCount(4);
            const groupIcons = page.locator('.st-group-item .menu-icon');
            const names = await groupIcons.evaluateAll(nodes => nodes.map(node => node.dataset.icon));
            expect(new Set(names).size).toBe(names.length);
            await expect(groupIcons.locator('svg')).toHaveCount(names.length);
            const next = language === 'ar' ? 'ArrowLeft' : 'ArrowRight';
            const previous = language === 'ar' ? 'ArrowRight' : 'ArrowLeft';
            await press(page, next);
            await expect(page.locator('.st-row.focused .st-label')).toHaveText(labels.rename);
            await press(page, 'Enter');
            await expect(page.locator('#profile-name')).toHaveValue('Me');
            await back(page);
            await press(page, previous);
            await expect(page.locator('.st-row.focused .st-label')).toHaveText(labels.avatar);
            await press(page, 'Enter');
            await expect(page.locator('#avatar-picker')).toBeVisible();
            await back(page);
            // The original linear route still reaches every action and toggle.
            for (const label of [labels.rename, labels.add, labels.remove]) {
                await press(page, 'ArrowDown');
                await expect(page.locator('.st-row.focused .st-label')).toHaveText(label);
            }
            await press(page, 'ArrowDown');
            await expect(page.locator('.st-row.focused .st-switch')).toBeVisible();
        });
    }
}
