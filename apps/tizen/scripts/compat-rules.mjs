/**
 * Language and CSS features the web build may use that a 2023 Samsung TV on
 * its original firmware cannot run. Tizen 7.0 ships a Chromium M94 web
 * engine; Tizen OS upgrades (e.g. 9.0) ship a newer engine. The startup probe
 * reports the real engine, so this list is evidence for phase planning, not a
 * gate. `since` is the first Chromium version with the feature.
 */
export const BASELINE_CHROMIUM = 94;

export const JS_RULES = [
    { feature: 'structuredClone', since: 98, pattern: /\bstructuredClone\(/g },
    {
        feature: 'Array findLast/findLastIndex',
        since: 97,
        pattern: /\.findLast(?:Index)?\(/g,
    },
    {
        feature: 'Array toSorted/toReversed/toSpliced',
        since: 110,
        pattern: /\.to(?:Sorted|Reversed|Spliced)\(/g,
    },
    {
        feature: 'Object.groupBy / Map.groupBy',
        since: 117,
        pattern: /\b(?:Object|Map)\.groupBy\(/g,
    },
    {
        feature: 'Promise.withResolvers',
        since: 119,
        pattern: /\bPromise\.withResolvers\(/g,
    },
    {
        feature: 'Array.fromAsync',
        since: 121,
        pattern: /\bArray\.fromAsync\(/g,
    },
    {
        feature: 'Set methods (union/intersection/...)',
        since: 122,
        pattern:
            /\.(?:union|intersection|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\(/g,
    },
    {
        feature: 'AbortSignal.any',
        since: 116,
        pattern: /\bAbortSignal\.any\(/g,
    },
    {
        feature: 'AbortSignal.timeout',
        since: 103,
        pattern: /\bAbortSignal\.timeout\(/g,
    },
    { feature: 'Array/String .at()', since: 92, pattern: /\.at\(-/g },
];

export const CSS_RULES = [
    { feature: 'CSS :has()', since: 105, pattern: /:has\(/g },
    {
        feature: 'CSS container queries',
        since: 105,
        pattern: /@container\b|container-type:/g,
    },
    { feature: 'CSS color-mix()', since: 111, pattern: /color-mix\(/g },
    { feature: 'CSS light-dark()', since: 123, pattern: /light-dark\(/g },
    {
        feature: 'CSS dynamic viewport units',
        since: 108,
        pattern: /\d(?:dvh|svh|lvh|dvw|svw|lvw)\b/g,
    },
    { feature: 'CSS cascade layers', since: 99, pattern: /@layer\b/g },
    {
        feature: 'CSS nesting',
        since: 112,
        pattern: /\{[^{}]*&[^{}]*\{/g,
        cssFilesOnly: true,
    },
    {
        feature: 'CSS text-wrap balance/pretty',
        since: 114,
        pattern: /text-wrap(?:-style)?:\s*(?:balance|pretty)/g,
    },
    { feature: 'CSS :is()/:where()', since: 88, pattern: /:(?:is|where)\(/g },
];

/**
 * Counts each rule's matches in the given text. Rules whose `since` is not
 * newer than the baseline are reported as supported.
 */
export function scanText(text, rules, baseline = BASELINE_CHROMIUM) {
    return rules
        .map(({ feature, since, pattern }) => ({
            feature,
            since,
            count: (text.match(pattern) ?? []).length,
            supported: since <= baseline,
        }))
        .filter((row) => row.count > 0);
}
