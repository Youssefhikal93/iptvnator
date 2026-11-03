import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startLocalServer } from './local-server.mjs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { widgetBootReport } from './boot-report.mjs';
import { inflateRawSync } from 'node:zlib';
import { CSS_RULES, JS_RULES, scanText } from './compat-rules.mjs';
import { createFakeM3u } from './fake-playlist.mjs';
import {
    PROBE_FILES,
    PROBE_TAG,
    injectProbe,
    renderAppConfig,
    renderConfigXml,
    toTizenVersion,
} from './widget-files.mjs';
import { createZip } from './zip.mjs';

const INDEX =
    '<!doctype html><html><head><meta charset="utf-8"><base href="./"><script src="main.js" type="module"></script></head><body></body></html>';

test('injectProbe puts the probe before every other script, once', () => {
    const html = injectProbe(INDEX);
    assert.ok(html.indexOf(PROBE_TAG) < html.indexOf('main.js'));
    assert.ok(html.indexOf('<head>') < html.indexOf(PROBE_TAG));
    assert.equal(injectProbe(html), html);
});

test('injectProbe rejects a document without head', () => {
    assert.throws(() => injectProbe('<html><body></body></html>'), /no <head>/);
});

test('toTizenVersion keeps x.y.z and drops pre-release suffixes', () => {
    assert.equal(toTizenVersion('0.25.0'), '0.25.0');
    assert.equal(toTizenVersion('1.2.3-beta.4'), '1.2.3');
    assert.throws(() => toTizenVersion('256.0.0'), /out of Tizen range/);
    assert.throws(() => toTizenVersion('next'), /Unsupported/);
});

test('committed config.xml has its own id, package, name and TV profile', async () => {
    const template = await readFile(
        new URL('../config.xml', import.meta.url),
        'utf8'
    );
    const xml = renderConfigXml(template, '0.25.0');
    assert.match(xml, /version="0\.25\.0"/);
    const application = /<tizen:application\b[^>]*>/.exec(xml)[0];
    const packageId = /\bpackage="([^"]+)"/.exec(application)[1];
    const applicationId = /\bid="([^"]+)"/.exec(application)[1];
    assert.match(packageId, /^[A-Za-z0-9]{10}$/);
    assert.equal(applicationId, packageId + '.IPTVnator');
    assert.match(xml, /<name>IPTVnator<\/name>/);
    assert.match(xml, /<tizen:profile name="tv-samsung"\/>/);
    assert.match(xml, /privilege\/internet/);
    // Jo-TV's package must never be reused: the apps install side by side.
    assert.doesNotMatch(xml, /IPTVnTVApp/);
});

test('web:build:tizen has no service worker, an index base and hash routing', async () => {
    const project = JSON.parse(
        await readFile(
            new URL('../../web/project.json', import.meta.url),
            'utf8'
        )
    );
    const tizen = project.targets.build.configurations.tizen;
    assert.equal(tizen.serviceWorker, false);
    assert.equal(tizen.baseHref, 'index.html');
    assert.equal(tizen.outputPath.base, 'dist/apps/web-tizen');
    assert.ok(
        tizen.fileReplacements.some(
            (entry) =>
                entry.replace.endsWith('router-location.providers.ts') &&
                entry.with.endsWith('router-location.providers.tizen.ts')
        )
    );
    // Only the tizen configuration swaps the router location.
    for (const [name, config] of Object.entries(
        project.targets.build.configurations
    )) {
        if (name === 'tizen') continue;
        const replacements = JSON.stringify(config.fileReplacements ?? []);
        assert.doesNotMatch(replacements, /router-location/, name);
    }
});

test('createZip writes entries that inflate back to their content', () => {
    const data = Buffer.from('hello tizen'.repeat(20));
    const zip = createZip([{ name: 'dir/a.txt', data }]);
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    const nameLength = zip.readUInt16LE(26);
    const size = zip.readUInt32LE(18);
    const start = 30 + nameLength;
    assert.equal(zip.subarray(30, start).toString(), 'dir/a.txt');
    assert.deepEqual(inflateRawSync(zip.subarray(start, start + size)), data);
    assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
    assert.deepEqual(createZip([{ name: 'dir/a.txt', data }]), zip);
});

test('createFakeM3u points every URL at the local origin', () => {
    const m3u = createFakeM3u({
        channels: 3,
        groups: 2,
        origin: 'http://127.0.0.1:1',
    });
    const urls = m3u.match(/https?:\/\/[^\s"]+/g);
    assert.equal(m3u.split('#EXTINF').length - 1, 3);
    assert.ok(urls.every((url) => url.startsWith('http://127.0.0.1:1/')));
});

test('probes are ES5 and read no URLs', async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const espree = createRequire(require.resolve('eslint'))('espree');
    for (const file of PROBE_FILES) {
        const probe = await readFile(
            new URL(`../src/${file}`, import.meta.url),
            'utf8'
        );
        espree.parse(probe, { ecmaVersion: 5 });
        assert.doesNotMatch(
            probe,
            /location\.href|document\.URL|\.currentSrc|\.textContent\s*\)/
        );
    }
});

test('renderAppConfig sets only an http(s) backend without credentials', () => {
    assert.equal(
        renderAppConfig('http://192.168.0.21:3333/'),
        'window.__IPTVNATOR_CONFIG__ = Object.assign({}, window.__IPTVNATOR_CONFIG__, {"BACKEND_URL":"http://192.168.0.21:3333"});\n'
    );
    assert.throws(
        () => renderAppConfig('http://user:pw@host:3333'),
        /without credentials/
    );
    assert.throws(() => renderAppConfig('file:///etc'), /http\(s\)/);
    assert.throws(
        () => renderAppConfig('http://private-user:private-secret@'),
        (error) => {
            assert.doesNotMatch(
                JSON.stringify(error) + error.message,
                /private-user|private-secret/
            );
            return true;
        }
    );
});

test('scanText reports features newer than the baseline', () => {
    const rows = scanText(
        'a{color:color-mix(in srgb,red,blue)} b:is(.x){}',
        CSS_RULES
    );
    assert.deepEqual(
        rows.map(({ feature, supported }) => [feature, supported]),
        [
            ['CSS color-mix()', false],
            ['CSS :is()/:where()', true],
        ]
    );
    assert.equal(
        scanText('structuredClone(x);structuredClone(y)', JS_RULES)[0].count,
        2
    );
});

test('file-origin boot fails for probe errors, capped readiness or missing rendering', () => {
    const ready = {
        screen: 'app-dashboard',
        firstRender: 10,
        appReadyCapped: false,
        errors: [],
    };
    for (const [patch, fragment, consoleErrors, expected] of [
        [{}, '#/workspace/dashboard', 0, true],
        [{ errors: ['private error text'] }, '#/workspace/dashboard', 0, false],
        [{ appReadyCapped: true }, '#/workspace/dashboard', 0, false],
        [{ firstRender: null }, '#/workspace/dashboard', 0, false],
        [{ screen: null }, '#/workspace/dashboard', 0, false],
        [{}, '', 0, false],
        [{}, '#/workspace/dashboard', 1, false],
    ]) {
        const report = widgetBootReport(
            { ...ready, ...patch },
            fragment,
            consoleErrors
        );
        assert.equal(report.ok, expected);
        assert.doesNotMatch(JSON.stringify(report), /private error text/);
    }
});

test('startup diagnostics omit credentials, playlist URLs and arbitrary resource names', async () => {
    const listeners = new Map();
    const window = {
        performance: { now: () => 0 },
        addEventListener: (name, listener) => listeners.set(name, listener),
    };
    const probe = await readFile(
        new URL('../src/tizen-startup-probe.js', import.meta.url),
        'utf8'
    );
    runInNewContext(probe, {
        window,
        navigator: { userAgent: '' },
        document: {
            addEventListener() {
                // Keep startup pending while dispatching errors at the browser boundary.
            },
        },
    });
    listeners.get('error')({
        target: window,
        message: 'password=private-secret',
    });
    listeners.get('unhandledrejection')({
        reason: new Error('username=private-user'),
    });
    for (const src of [
        'http://provider.invalid/live/user/secret',
        'https://provider.invalid/chunk-ABC123.js?password=secret',
    ]) {
        listeners.get('error')({ target: { tagName: 'SCRIPT', src } });
    }
    assert.deepEqual(
        JSON.parse(JSON.stringify(window.__TIZEN_STARTUP__.errors)),
        [
            'script error (details omitted)',
            'unhandled rejection (details omitted)',
            'resource load failed (details omitted)',
            'resource load failed (details omitted)',
        ]
    );
});

async function localServerFixture(t) {
    const directory = await mkdtemp(path.join(tmpdir(), 'tizen-local-server-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const widget = path.join(directory, 'widget');
    const privateDirectory = path.join(directory, 'widget-private');
    await mkdir(widget);
    await mkdir(privateDirectory);
    await writeFile(path.join(widget, 'index.html'), 'widget home');
    await writeFile(path.join(privateDirectory, 'x'), 'private sibling file');
    const server = await startLocalServer(widget, { channels: 3 });
    t.after(() => server.close());
    return server.origin;
}

test('local server rejects encoded traversal to a sibling sharing the widget prefix', async (t) => {
    const origin = await localServerFixture(t);
    const escaped = await fetch(origin + '/..%2fwidget-private/x');
    assert.equal(escaped.status, 403);
    assert.doesNotMatch(await escaped.text(), /private sibling file/);
    const home = await fetch(origin + '/');
    assert.equal(home.status, 200);
    assert.equal(await home.text(), 'widget home');
});

test('local server returns 400 for malformed encoding and keeps serving requests', async (t) => {
    const origin = await localServerFixture(t);
    for (const pathname of ['/%', '/%E0%A4%A']) {
        const malformed = await fetch(origin + pathname, {
            signal: AbortSignal.timeout(2000),
        });
        assert.equal(malformed.status, 400);
        await malformed.text();
    }
    const home = await fetch(origin + '/');
    assert.equal(home.status, 200);
    assert.equal(await home.text(), 'widget home');
});
