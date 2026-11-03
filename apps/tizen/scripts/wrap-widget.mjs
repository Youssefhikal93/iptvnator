/**
 * Wraps the `web:build:tizen` output as a Tizen widget directory:
 * copies the build, drops service-worker files, injects the startup probe,
 * and adds config.xml (version from package.json) and the app icon.
 *
 * Usage: node apps/tizen/scripts/wrap-widget.mjs [--src dist/apps/web-tizen]
 *        [--out dist/apps/tizen/widget] [--backend-url http://<PC-IP>:3333]
 */
import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
    PROBE_FILES,
    SERVICE_WORKER_FILES,
    injectProbe,
    renderAppConfig,
    renderConfigXml,
} from './widget-files.mjs';

// The app's own icon (same artwork as the desktop and PWA icons).
const ICON = 'apps/web/src/assets/icons/favicon.512x512.png';

const { values } = parseArgs({
    options: {
        src: { type: 'string', default: 'dist/apps/web-tizen' },
        out: { type: 'string', default: 'dist/apps/tizen/widget' },
        // Phase 0 test aid: a web-backend on the PC (see README).
        'backend-url': { type: 'string' },
    },
});
const src = path.resolve(values.src);
const out = path.resolve(values.out);

if (!existsSync(path.join(src, 'index.html'))) {
    throw new Error(`${values.src}/index.html is missing; run web:build:tizen`);
}

await rm(out, { recursive: true, force: true });
await cp(src, out, { recursive: true });
for (const file of SERVICE_WORKER_FILES) {
    await rm(path.join(out, file), { force: true });
}

const indexPath = path.join(out, 'index.html');
await writeFile(indexPath, injectProbe(await readFile(indexPath, 'utf8')));
for (const file of PROBE_FILES) {
    await cp(path.resolve('apps/tizen/src', file), path.join(out, file));
}

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const template = await readFile('apps/tizen/config.xml', 'utf8');
await writeFile(
    path.join(out, 'config.xml'),
    renderConfigXml(template, version)
);
await cp(path.resolve(ICON), path.join(out, 'icon.png'));
if (values['backend-url']) {
    await writeFile(
        path.join(out, 'assets/app-config.js'),
        renderAppConfig(values['backend-url'])
    );
    console.log('BACKEND_URL override configured');
}

console.log(`Tizen widget ready in ${path.relative(process.cwd(), out)}`);
