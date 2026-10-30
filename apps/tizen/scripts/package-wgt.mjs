/**
 * Packages the widget directory as an UNSIGNED `.wgt` (a ZIP). TVs only
 * install signed packages: apps/tizen/deploy-tv.ps1 signs with the owner's
 * Samsung certificate profile through `tizen package -s <profile>`.
 *
 * Usage: node apps/tizen/scripts/package-wgt.mjs [--widget dist/apps/tizen/widget]
 *        [--out dist/apps/tizen/IPTVnator-unsigned.wgt]
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createZip } from './zip.mjs';

const { values } = parseArgs({
    options: {
        widget: { type: 'string', default: 'dist/apps/tizen/widget' },
        out: {
            type: 'string',
            default: 'dist/apps/tizen/IPTVnator-unsigned.wgt',
        },
    },
});
const root = path.resolve(values.widget);
const files = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) =>
        path.relative(root, path.join(entry.parentPath, entry.name))
    )
    .map((name) => name.split(path.sep).join('/'))
    .sort();
if (!files.includes('config.xml')) {
    throw new Error(`${values.widget} has no config.xml; run tizen:wrap first`);
}
const entries = await Promise.all(
    files.map(async (name) => ({
        name,
        data: await readFile(path.join(root, name)),
    }))
);
const zip = createZip(entries);
await writeFile(values.out, zip);
console.log(
    `${values.out}: ${files.length} files, ${(zip.length / 1048576).toFixed(2)} MB (unsigned)`
);
