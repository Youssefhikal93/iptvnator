/** Free-form browser errors can contain credentials; report counts only. */
export function widgetBootReport(probe, fragmentRoute, consoleErrorCount) {
    return {
        screen: probe.screen,
        fragmentRoute,
        probeErrorCount: probe.errors.length,
        consoleErrorCount,
        ok: Boolean(
            probe.screen &&
            probe.firstRender !== null &&
            !probe.appReadyCapped &&
            fragmentRoute.startsWith('#/') &&
            probe.errors.length === 0 &&
            consoleErrorCount === 0
        ),
    };
}
