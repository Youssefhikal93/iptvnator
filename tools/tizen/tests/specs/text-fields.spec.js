const { test, expect, boot, press, setting } = require('./helpers');

// The TV keyboard drops text it has not committed when its field loses the
// focus. The page stands in for it: a blur empties the field, as the TV did.
async function keyboardDropsOnBlur(page) {
    await page.evaluate(() => document.addEventListener('focusout', (event) => {
        if (event.target.tagName === 'INPUT') event.target.value = '';
    }, true));
}

async function newProfileName(page) {
    await setting(page, 'Add profile…');
    await press(page, 'Enter');
    await expect(page.locator('#profile-name')).toBeFocused();
}

test('a typed name survives ▼ and ▲ out of the field and is saved', async ({ page }) => {
    await boot(page);
    await newProfileName(page);
    await keyboardDropsOnBlur(page);
    await page.keyboard.type('Anna');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await expect(page.locator('#profile-dialog-ok')).toBeFocused();
    await expect(page.locator('#profile-name')).toHaveValue('Anna');
    // Back into the field (past the Kids switch, #62) and out again keeps it too.
    await press(page, 'ArrowUp');
    await press(page, 'ArrowUp');
    await expect(page.locator('#profile-name')).toBeFocused();
    await page.keyboard.type('belle');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await expect(page.locator('#profile-name')).toHaveValue('Annabelle');
    await press(page, 'Enter');
    await expect(page.locator('#profile-dialog')).toHaveCount(0);
    await expect(page.locator('#settings .st-row', { hasText: 'Current profile' }).locator('.st-value')).toHaveText('Annabelle');
});

test('the keyboard Cancel keeps the dialog and the text; Done goes on to the button', async ({ page }) => {
    await boot(page);
    await newProfileName(page);
    await page.keyboard.type('Omar');
    await page.locator('#profile-name').dispatchEvent('keydown', { keyCode: 65385 });
    await expect(page.locator('#profile-dialog')).toBeVisible();
    await expect(page.locator('#profile-name')).toHaveValue('Omar');
    await page.locator('#profile-name').dispatchEvent('keydown', { keyCode: 65376 });
    await expect(page.locator('#profile-dialog-ok')).toBeFocused();
});

test('text typed again right after leaving a field is not replaced by the older text', async ({ page }) => {
    await boot(page);
    await newProfileName(page);
    // Leave the empty field, come back, type and leave again, all within the restore window.
    await page.evaluate(async () => {
        const input = document.getElementById('profile-name');
        const ok = document.getElementById('profile-dialog-ok');
        ok.focus();
        input.focus();
        input.value = 'Quick';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        ok.focus();
        await new Promise((done) => setTimeout(done, 400));
    });
    await expect(page.locator('#profile-name')).toHaveValue('Quick');
});

test('text the app clears is not brought back', async ({ page }) => {
    await boot(page);
    await newProfileName(page);
    await page.keyboard.type('Temp');
    await press(page, 'ArrowDown');
    await page.locator('#profile-name').evaluate((input) => { input.value = ''; });
    await press(page, 'ArrowUp');
    await press(page, 'ArrowDown');
    await expect(page.locator('#profile-name')).toHaveValue('');
});
