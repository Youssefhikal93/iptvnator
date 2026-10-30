/**
 * Pure helpers that turn the `web:build:tizen` output into a Tizen widget.
 * They have no filesystem access so the unit tests can cover them directly.
 */

/** Probe scripts from apps/tizen/src, injected in this order. */
export const PROBE_FILES = ['tizen-startup-probe.js', 'tizen-scroll-probe.js'];
export const PROBE_TAG = PROBE_FILES.map(
    (file) => `<script src="${file}"></script>`
).join('\n        ');

/**
 * Angular service-worker outputs. The `tizen` build configuration already
 * turns the service worker off and the app never registers one on a `file:`
 * origin (`shouldEnableServiceWorker`), but a stale build could still carry
 * them, so the wrapper drops them to keep the widget free of PWA workers.
 */
export const SERVICE_WORKER_FILES = [
    'ngsw-worker.js',
    'ngsw.json',
    'safety-worker.js',
    'worker-basic.min.js',
];

/**
 * Inserts the probe scripts first in `<head>`, so they run before the app
 * config and the Angular bundles. Idempotent.
 */
export function injectProbe(html) {
    if (html.includes(PROBE_TAG)) return html;
    const head = /<head(\s[^>]*)?>/i.exec(html);
    if (!head) throw new Error('index.html has no <head> element');
    const at = head.index + head[0].length;
    return `${html.slice(0, at)}\n        ${PROBE_TAG}${html.slice(at)}`;
}

/**
 * Tizen accepts `x.y.z` with x and y in 0..255 and z in 0..65535. Pre-release
 * and build suffixes of the npm version are dropped.
 */
export function toTizenVersion(npmVersion) {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(npmVersion));
    if (!match) throw new Error(`Unsupported version: ${npmVersion}`);
    const [major, minor, patch] = match.slice(1).map(Number);
    if (major > 255 || minor > 255 || patch > 65535) {
        throw new Error(`Version out of Tizen range: ${npmVersion}`);
    }
    return `${major}.${minor}.${patch}`;
}

/**
 * `assets/app-config.js` with a fixed BACKEND_URL (the PWA runtime config).
 * Phase 0 only: lets a TV import a large M3U by URL through a web-backend
 * on the PC until phase 1 adds direct data. Only http(s) without
 * credentials is accepted.
 */
export function renderAppConfig(backendUrl) {
    const url = new URL(backendUrl);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
        throw new Error('backend URL must be http(s) without credentials');
    }
    const config = JSON.stringify({
        BACKEND_URL: url.href.replace(/\/+$/, ''),
    });
    return `window.__IPTVNATOR_CONFIG__ = Object.assign({}, window.__IPTVNATOR_CONFIG__, ${config});\n`;
}

/** Fills the `{{version}}` placeholder of the committed config.xml. */
export function renderConfigXml(template, npmVersion) {
    if (!template.includes('{{version}}')) {
        throw new Error('config.xml template has no {{version}} placeholder');
    }
    return template.replaceAll('{{version}}', toTizenVersion(npmVersion));
}
