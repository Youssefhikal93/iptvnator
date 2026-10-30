/**
 * Local proxy measurement for the Tizen widget (phase 0, issue #18). Serves
 * dist/apps/tizen/widget on 127.0.0.1, opens it in Chromium at 1920x1080 with
 * CDP CPU throttling and reads the startup probe. Then imports a fake
 * 12k-channel M3U (file upload: parsed in the browser, no backend), waits
 * for the injected scroll probe (src/tizen-scroll-probe.js) to benchmark the
 * channel list, and starts the app again with that playlist saved.
 *
 * Every request to another host is aborted and counted, so no real provider
 * or public backend is contacted. Desktop Chromium is not a TV: treat the
 * numbers as a rough proxy; the go/no-go numbers come from the TV probe.
 *
 * Usage: node apps/tizen/scripts/measure-local.mjs [--rates 1,4,6]
 *        [--channels 12000] [--out dist/apps/tizen/perf]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { startLocalServer } from './local-server.mjs';

const { values } = parseArgs({
    options: {
        widget: { type: 'string', default: 'dist/apps/tizen/widget' },
        rates: { type: 'string', default: '1,4,6' },
        channels: { type: 'string', default: '12000' },
        out: { type: 'string', default: 'dist/apps/tizen/perf' },
    },
});
const channels = Number(values.channels);
const server = await startLocalServer(values.widget, { channels });
const browser = await launch();
const runs = [];
try {
    for (const rate of values.rates.split(',').map(Number)) {
        console.log(`CPU throttling ${rate}x ...`);
        runs.push({ rate, ...(await measureRate(rate)) });
    }
} finally {
    await browser.close();
    await server.close();
}
await mkdir(values.out, { recursive: true });
const report = {
    at: new Date().toISOString(),
    browser: browser.version(),
    viewport: '1920x1080',
    channels,
    runs,
};
await writeFile(
    path.join(values.out, 'local-results.json'),
    JSON.stringify(report, null, 2)
);
console.log(JSON.stringify(report, null, 2));

async function launch() {
    try {
        return await chromium.launch();
    } catch {
        // Playwright's own Chromium is not downloaded: use installed Chrome.
        return chromium.launch({ channel: 'chrome' });
    }
}

async function measureRate(rate) {
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
    });
    const blockedHosts = new Set();
    await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (
            url.origin === server.origin ||
            url.protocol === 'data:' ||
            url.protocol === 'blob:'
        ) {
            return route.continue();
        }
        blockedHosts.add(url.hostname);
        return route.abort();
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await cdp.send('Performance.enable');
    const jsFiles = new Map();
    page.on('response', async (response) => {
        if (response.url().endsWith('.js')) {
            const size = Number(
                (await response.allHeaders())['content-length'] ?? 0
            );
            jsFiles.set(
                path.posix.basename(new URL(response.url()).pathname),
                size
            );
        }
    });

    const cold = await startApp(page, cdp);
    const coldJs = [...jsFiles].sort((a, b) => b[1] - a[1]);
    const importMs = await importPlaylist(page);
    // The injected scroll probe benchmarks the list by itself, as on the TV.
    await page.waitForFunction(() => window.__TIZEN_SCROLL__, null, {
        timeout: 120000,
    });
    const scroll = await page.evaluate(() => window.__TIZEN_SCROLL__);
    const heapAfterImportMb = await heapMb(cdp);
    const withPlaylist = await startApp(page, cdp);
    await context.close();
    return {
        cold,
        coldJsKb: Math.round(
            coldJs.reduce((sum, [, size]) => sum + size, 0) / 1024
        ),
        coldJsFiles: coldJs.length,
        coldJsLargest: coldJs
            .slice(0, 5)
            .map(([name, size]) => `${name} ${Math.round(size / 1024)} KB`),
        importMs,
        heapAfterImportMb,
        scroll,
        withPlaylist,
        blockedHosts: [...blockedHosts],
    };
}

async function startApp(page, cdp) {
    await page.goto(`${server.origin}/index.html`);
    await page.waitForFunction(
        () => window.__TIZEN_STARTUP__?.done === true,
        null,
        {
            timeout: 120000,
        }
    );
    const probe = await page.evaluate(() => window.__TIZEN_STARTUP__);
    return {
        fcp: probe.fcp,
        firstRender: probe.firstRender,
        appReady: probe.appReady,
        appReadyCapped: probe.appReadyCapped,
        screen: probe.screen,
        heapMb: await heapMb(cdp),
        errors: probe.errors,
    };
}

async function heapMb(cdp) {
    const { metrics } = await cdp.send('Performance.getMetrics');
    const used = metrics.find((metric) => metric.name === 'JSHeapUsedSize');
    return used ? Math.round(used.value / 1048576) : null;
}

async function importPlaylist(page) {
    await page.getByRole('button', { name: 'Add playlist' }).first().click();
    const dialog = page.locator('mat-dialog-container');
    await dialog.getByRole('radio', { name: /M3U file/i }).click();
    await page.setInputFiles('input[type="file"]', {
        name: 'fake-12k.m3u',
        mimeType: 'audio/x-mpegurl',
        buffer: Buffer.from(server.playlist),
    });
    const add = dialog.getByRole('button', {
        name: 'Add playlist',
        exact: true,
    });
    const started = Date.now();
    await Promise.all([
        page.waitForURL(/\/workspace\/playlists\/.+\/all$/, {
            timeout: 180000,
        }),
        add.click(),
    ]);
    await page
        .locator('cdk-virtual-scroll-viewport')
        .first()
        .waitFor({ timeout: 180000 });
    return Date.now() - started;
}
