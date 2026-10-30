const { test, expect, boot, press, back } = require('./helpers');

// The TV's exit, recorded instead of closing the page.
async function watchExit(page) {
    await page.addInitScript(() => {
        window.exited = 0;
        window.tizen = { application: { getCurrentApplication: () => ({ exit: () => { window.exited++; } }) } };
    });
}

// Return from wherever the app starts until the exit question shows.
async function backToExit(page) {
    for (let i = 0; i < 5 && !(await page.locator('#menu').isVisible()); i++) await back(page);
    await expect(page.locator('#menu .menu-title')).toHaveText('Exit Jo-TV?');
}

const exited = page => page.evaluate(() => window.exited);

test('Return that would close the app asks first; Cancel is focused, and OK on it or Return stays', async ({ page }) => {
    await watchExit(page);
    await boot(page);
    await backToExit(page);
    await expect(page.locator('#menu .menu-row')).toHaveText(['Exit', 'Cancel']);
    await expect(page.locator('#menu .menu-row.focused')).toHaveText('Cancel');
    // A stray OK keeps the app open.
    await press(page, 'Enter');
    await expect(page.locator('#menu')).toBeHidden();
    expect(await exited(page)).toBe(0);
    // So does a second Return.
    await backToExit(page);
    await back(page);
    await expect(page.locator('#menu')).toBeHidden();
    expect(await exited(page)).toBe(0);
    await expect(page.locator('#rail')).toBeVisible();
    // ▲ to Exit and OK closes it.
    await backToExit(page);
    await press(page, 'ArrowUp');
    await expect(page.locator('#menu .menu-row.focused')).toHaveText('Exit');
    await press(page, 'Enter');
    await expect.poll(() => exited(page)).toBe(1);
});

test('Return on Who is watching asks too, and Cancel brings the profiles back', async ({ page }) => {
    await watchExit(page);
    await boot(page);
    await page.evaluate(() => ProfileStore.add('Anna'));
    await page.reload();
    await expect(page.locator('#profiles')).toBeVisible();
    await back(page);
    await expect(page.locator('#menu .menu-title')).toHaveText('Exit Jo-TV?');
    await press(page, 'Enter');
    await expect(page.locator('#profiles')).toBeVisible();
    expect(await exited(page)).toBe(0);
    // Return on the question works like Cancel.
    await back(page);
    await expect(page.locator('#menu')).toBeVisible();
    await back(page);
    await expect(page.locator('#profiles')).toBeVisible();
    await back(page);
    await press(page, 'ArrowUp');
    await press(page, 'Enter');
    await expect.poll(() => exited(page)).toBe(1);
});
