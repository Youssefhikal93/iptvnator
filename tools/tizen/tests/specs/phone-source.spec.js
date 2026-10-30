const { test, expect, boot, press, back, sources, sourceMenu, menuChoice } = require('./helpers');

// The Tizen service cannot run in the browser, so these tests stand in for it:
// they answer the app's 127.0.0.1 requests and play the phone's submit by
// changing the answer to the poll (#85).
const SERVICE = 'http://127.0.0.1:8777/**';
const CORS = { 'access-control-allow-origin': '*' };

async function fakeService(page, options = {}) {
    const service = { calls: [], opens: 0, poll: { state: 'waiting' }, ttl: options.ttl || 600000 };
    await page.route(SERVICE, async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        service.calls.push({ path, body: request.postData() });
        if (path === '/open') {
            if (options.down) return route.abort();
            service.opens++;
            return route.fulfill({ json: { code: service.opens === 1 ? 'K7M2QX' : 'N4P8RT', ttl: service.ttl, ip: '192.168.1.50', port: 8777 }, headers: CORS });
        }
        if (path === '/poll') return route.fulfill({ json: service.poll, headers: CORS });
        return route.fulfill({ json: { ok: true }, headers: CORS });
    });
    return service;
}

async function openPhone(page, row) {
    await boot(page);
    await sources(page, row);
    await press(page, 'Enter');
    await page.locator('#form-phone').click();
}

test('Use my phone shows a QR code, a short code and the link (#85)', async ({ page }) => {
    const service = await fakeService(page);
    await openPhone(page, '+  Add Xtream account');
    await expect(page.locator('#form-phone-panel')).toBeVisible();
    await expect(page.locator('#form-phone-panel h1')).toHaveText('Add from your phone');
    await expect(page.locator('#phone-code')).toHaveText('Code: K7M2QX');
    await expect(page.locator('#phone-url')).toHaveText('http://192.168.1.50:8777/K7M2QX');
    await expect(page.locator('#phone-qr')).toBeVisible();
    // The canvas holds black and white modules, not a blank square.
    const colours = await page.locator('#phone-qr').evaluate((canvas) => {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let black = 0;
        let white = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] === 0) black++;
            else if (data[i] === 255) white++;
        }
        return { black, white, size: canvas.width };
    });
    expect(colours.black).toBeGreaterThan(colours.size * 4);
    expect(colours.white).toBeGreaterThan(colours.black / 2);
    await expect(page.locator('#phone-note')).toContainText('once and for 10 minutes');
    await expect(page.locator('#phone-cancel')).toBeFocused();
    const open = service.calls.find((call) => call.path === '/open');
    const body = JSON.parse(open.body);
    expect(body.kind).toBe('xtream');
    expect(body.words.send).toBe('Send to TV');
    expect(body.dir).toBe('ltr');
    // Nothing the phone could send is on the TV's screen or in its log.
    expect(await page.locator('body').innerText()).not.toContain('hunter2');
});

test('a fake phone submit fills the form and the TV asks for the final OK (#85)', async ({ page }) => {
    const service = await fakeService(page);
    await openPhone(page, '+  Add Xtream account');
    await expect(page.locator('#phone-code')).toHaveText('Code: K7M2QX');
    const logs = [];
    page.on('console', (message) => logs.push(message.text()));
    service.poll = { state: 'received', payload: { name: 'From phone', url: new URL(page.url()).origin, user: 'other', pass: 'hunter2' } };
    await expect(page.locator('#form-phone-panel')).toBeHidden();
    await expect(page.locator('#form-name')).toHaveValue('From phone');
    await expect(page.locator('#form-url')).toHaveValue(new URL(page.url()).origin);
    await expect(page.locator('#form-user')).toHaveValue('other');
    await expect(page.locator('#form-pass')).toHaveValue('hunter2');
    await expect(page.locator('#form-msg')).toHaveText('Received from your phone. Check the details, then press Save.');
    await expect(page.locator('#form-save')).toBeFocused();
    // The service is told to stop once the details are taken.
    await expect.poll(() => service.calls.some((call) => call.path === '/close')).toBe(true);
    expect(logs.join('\n')).not.toContain('hunter2');
    // The form's own check and save are used.
    await press(page, 'Enter');
    await expect(page.locator('#form')).toBeHidden();
    await expect(page.locator('body')).toHaveAttribute('data-source', 'From phone');
});

test('the form still validates what the phone sent', async ({ page }) => {
    const service = await fakeService(page);
    await openPhone(page, '+  Add Xtream account');
    await expect(page.locator('#phone-code')).toHaveText('Code: K7M2QX');
    service.poll = { state: 'received', payload: { name: '', url: 'ftp://nope', user: 'u', pass: 'p' } };
    await expect(page.locator('#form-phone-panel')).toBeHidden();
    await page.locator('#form-save').click();
    await expect(page.locator('#form-msg')).toHaveText('The link must start with http:// or https://');
    await expect(page.locator('#form')).toBeVisible();
});

test('an M3U form asks the phone for a playlist link only', async ({ page }) => {
    const service = await fakeService(page);
    await openPhone(page, '+  Add M3U playlist');
    await expect(page.locator('#phone-code')).toHaveText('Code: K7M2QX');
    expect(JSON.parse(service.calls.find((call) => call.path === '/open').body).kind).toBe('m3u');
    service.poll = { state: 'received', payload: { name: 'Playlist', url: new URL(page.url()).origin + '/playlist.m3u' } };
    await expect(page.locator('#form-phone-panel')).toBeHidden();
    await expect(page.locator('#form-name')).toHaveValue('Playlist');
    await expect(page.locator('#form-user')).toHaveValue('');
});

test('an expired code says so and a new code can be asked for', async ({ page }) => {
    const service = await fakeService(page);
    await openPhone(page, '+  Add Xtream account');
    await expect(page.locator('#phone-code')).toHaveText('Code: K7M2QX');
    service.poll = { state: 'expired' };
    await expect(page.locator('#phone-status')).toHaveText('The code has expired.');
    await expect(page.locator('#phone-qr')).toBeHidden();
    await expect(page.locator('#phone-code')).toHaveText('');
    await expect(page.locator('#phone-new')).toBeFocused();
    service.poll = { state: 'waiting' };
    await press(page, 'Enter');
    await expect(page.locator('#phone-code')).toHaveText('Code: N4P8RT');
    await expect(page.locator('#phone-qr')).toBeVisible();
    await expect(page.locator('#phone-new')).toBeHidden();
});

test('the TV ends the code after its lifetime even if the service says nothing', async ({ page }) => {
    await fakeService(page, { ttl: 2500 });
    await openPhone(page, '+  Add Xtream account');
    await expect(page.locator('#phone-code')).toHaveText('Code: K7M2QX');
    await expect(page.locator('#phone-status')).toHaveText('The code has expired.', { timeout: 6000 });
    await expect(page.locator('#phone-url')).toHaveText('');
});

test('Return closes the panel, stops the service and keeps what was typed', async ({ page }) => {
    const service = await fakeService(page);
    await boot(page);
    await sources(page, '+  Add Xtream account');
    await press(page, 'Enter');
    await page.locator('#form-name').fill('Typed');
    await page.locator('#form-phone').focus();
    await press(page, 'Enter');
    await expect(page.locator('#phone-code')).toHaveText('Code: K7M2QX');
    await back(page);
    await expect(page.locator('#form-phone-panel')).toBeHidden();
    await expect(page.locator('#form')).toBeVisible();
    await expect(page.locator('#form-name')).toHaveValue('Typed');
    await expect(page.locator('#form-phone')).toBeFocused();
    await expect.poll(() => service.calls.some((call) => call.path === '/close')).toBe(true);
    const polls = service.calls.filter((call) => call.path === '/poll').length;
    await page.waitForTimeout(2000);
    expect(service.calls.filter((call) => call.path === '/poll').length).toBe(polls);
    // Cancel on the form closes it as before.
    await page.locator('#form-cancel').click();
    await expect(page.locator('#form')).toBeHidden();
});

test('closing the form while the code is open stops the service', async ({ page }) => {
    const service = await fakeService(page);
    await openPhone(page, '+  Add Xtream account');
    await expect(page.locator('#phone-code')).toHaveText('Code: K7M2QX');
    await page.locator('#phone-cancel').click();
    await expect(page.locator('#form-phone-panel')).toBeHidden();
    await expect.poll(() => service.calls.some((call) => call.path === '/close')).toBe(true);
});

test('left and right move between the panel buttons', async ({ page }) => {
    const service = await fakeService(page);
    await openPhone(page, '+  Add Xtream account');
    await expect(page.locator('#phone-code')).toHaveText('Code: K7M2QX');
    service.poll = { state: 'expired' };
    await expect(page.locator('#phone-new')).toBeFocused();
    await press(page, 'ArrowRight');
    await expect(page.locator('#phone-cancel')).toBeFocused();
    await press(page, 'ArrowLeft');
    await expect(page.locator('#phone-new')).toBeFocused();
});

test('without the service the panel says it could not start', async ({ page }) => {
    await fakeService(page, { down: true });
    await openPhone(page, '+  Add Xtream account');
    await expect(page.locator('#phone-status')).toHaveText('The phone service could not start. Check that the TV is on your home network.', { timeout: 15000 });
    await expect(page.locator('#phone-new')).toBeVisible();
});

test('editing a source has no phone option', async ({ page }) => {
    await fakeService(page);
    await boot(page);
    await sourceMenu(page, 'Regression TV');
    await menuChoice(page, 'Edit source…');
    await expect(page.locator('#form-title')).toHaveText('Edit source');
    await expect(page.locator('#form-phone')).toBeHidden();
});
