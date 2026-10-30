/**
 * Reports what in the widget would not run on the Tizen 7.0 engine
 * (Chromium M94): JavaScript syntax newer than ES2022 (parsed with espree)
 * and the JS/CSS features in compat-rules.mjs. Informational: exits 0.
 *
 * Usage: node apps/tizen/scripts/compat-scan.mjs [--widget dist/apps/tizen/widget] [--json]
 */
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
    BASELINE_CHROMIUM,
    CSS_RULES,
    JS_RULES,
    scanText,
} from './compat-rules.mjs';

const require = createRequire(import.meta.url);
const espree = createRequire(require.resolve('eslint'))('espree');

const { values } = parseArgs({
    options: {
        widget: { type: 'string', default: 'dist/apps/tizen/widget' },
        json: { type: 'boolean', default: false },
    },
});
const root = path.resolve(values.widget);
const files = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.(?:m?js|css)$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));

const totals = new Map();
const syntaxFailures = [];
for (const file of files) {
    const text = await readFile(file, 'utf8');
    const isCss = file.endsWith('.css');
    // Angular inlines component styles into the JS chunks, so JS files get
    // both rule sets (except nesting, whose pattern also matches JS code).
    const rules = isCss
        ? CSS_RULES
        : [...JS_RULES, ...CSS_RULES.filter((rule) => !rule.cssFilesOnly)];
    for (const row of scanText(text, rules)) {
        const total = totals.get(row.feature) ?? { ...row, count: 0, files: 0 };
        total.count += row.count;
        total.files += 1;
        totals.set(row.feature, total);
    }
    if (!isCss) {
        try {
            espree.parse(text, { ecmaVersion: 2022, sourceType: 'module' });
        } catch (error) {
            syntaxFailures.push(`${path.basename(file)}: ${error.message}`);
        }
    }
}

const rows = [...totals.values()].sort((a, b) => b.since - a.since);
const report = {
    baseline: `Chromium ${BASELINE_CHROMIUM}`,
    syntaxFailures,
    features: rows,
};
if (values.json) {
    console.log(JSON.stringify(report, null, 2));
} else {
    console.log(
        `Compatibility with Chromium ${BASELINE_CHROMIUM} (Tizen 7.0), ${files.length} files`
    );
    console.log(
        `ES2022 syntax: ${syntaxFailures.length === 0 ? 'ok' : syntaxFailures.join('; ')}`
    );
    for (const row of rows) {
        const status = row.supported ? 'ok' : `needs Chromium ${row.since}`;
        console.log(
            `  ${row.feature}: ${row.count} uses in ${row.files} files (${status})`
        );
    }
}
