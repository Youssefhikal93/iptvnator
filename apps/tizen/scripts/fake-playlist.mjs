/**
 * Deterministic fake M3U for local performance runs. Every URL points at the
 * local measurement server: no real provider is ever contacted.
 */
export function createFakeM3u({ channels = 12000, groups = 60, origin }) {
    if (!origin) throw new Error('origin is required');
    const lines = ['#EXTM3U'];
    for (let index = 1; index <= channels; index += 1) {
        const id = String(index).padStart(5, '0');
        const group = `Group ${String((index % groups) + 1).padStart(2, '0')}`;
        lines.push(
            `#EXTINF:-1 tvg-id="fake.${id}" tvg-name="Channel ${id}" ` +
                `tvg-logo="${origin}/logo/${index % 50}.png" group-title="${group}",Channel ${id}`,
            `${origin}/stream/${id}.ts`
        );
    }
    return `${lines.join('\n')}\n`;
}
