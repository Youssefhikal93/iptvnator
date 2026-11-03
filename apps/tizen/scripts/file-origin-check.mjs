/**
 * Boots the widget from file:// like the TV does (Chromium with file access
 * from files, which a packaged widget needs for its ES module chunks) and
 * checks that the first screen renders with routing in the URL fragment.
 * Exits 1 when it does not. Network requests are aborted.
 *
 * Usage: node apps/tizen/scripts/file-origin-check.mjs [--widget dist/apps/tizen/widget]
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { widgetBootReport } from './boot-report.mjs';

const { values } = parseArgs({
    options: { widget: { type: 'string', default: 'dist/apps/tizen/widget' } },
});
const index = pathToFileURL(path.resolve(values.widget, 'index.html')).href;
const args = ['--allow-file-access-from-files'];
const browser = await chromium
    .launch({ args })
    .catch(() => chromium.launch({ channel: 'chrome', args }));
try {
    const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
    });
    await page.route(/^(?:https?|wss?):/, (route) => route.abort());
    let consoleErrorCount = 0;
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrorCount += 1;
    });
    await page.goto(index);
    await page.waitForFunction(
        () => window.__TIZEN_STARTUP__?.done === true,
        null,
        {
            timeout: 60000,
        }
    );
    const probe = await page.evaluate(() => window.__TIZEN_STARTUP__);
    const report = widgetBootReport(
        probe,
        new URL(page.url()).hash,
        consoleErrorCount
    );
    console.log(JSON.stringify(report, null, 2));
    console.log(report.ok ? 'file:// boot ok' : 'file:// boot FAILED');
    process.exitCode = report.ok ? 0 : 1;
} finally {
    await browser.close();
}
