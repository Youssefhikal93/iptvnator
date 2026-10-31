// The Sources group, first in Settings (#51): each saved source with its
// state, then the rows that add one. OK on a source opens its options:
// switch, refresh, edit, the guide, remove, and the account details.
window.SourceSettings = (function () {
    'use strict';

    function note(row) {
        return { label: row.label, note: true };
    }

    // Remove asks once more, like the profile delete.
    function confirmRemove(source, hooks) {
        Menu.open(source.name, [
            { label: I18n.t('sources.pressAgain'), run: function () { hooks.remove(source); } },
            { label: I18n.t('common.cancel'), run: function () { open(source, hooks); } },
        ]);
    }

    function open(source, hooks) {
        var current = hooks.current();
        var isCurrent = !!current && current.id === source.id;
        var options = [
            { label: I18n.t(isCurrent ? 'sources.watch' : 'sources.switch'), run: function () { hooks.use(source); } },
            { label: I18n.t('sources.refresh'), run: function () { hooks.refresh(source); } },
            { label: I18n.t('sources.edit'), run: function () { hooks.edit(source); } },
        ].concat(hooks.guide(source), [
            { label: I18n.t('common.remove'), run: function () { confirmRemove(source, hooks); } },
            { label: Sources.typeLabel(source) + ' · ' + source.url, note: true },
        ], SourceAccount.detailRows(source, isCurrent ? hooks.info() : null).map(note));
        Menu.open(source.name, options);
    }

    // When the source's lists were last fetched again, by hand or by themselves (#86).
    function refreshedText(source) {
        var at = AutoRefresh.refreshedAt(source.id);
        if (!at) return I18n.t('sources.neverRefreshed');
        return I18n.t('sources.refreshedAt', { when: I18n.date(at, { day: 'numeric', month: 'short' }) + ' ' + I18n.time(at) });
    }

    function rows(hooks) {
        var current = hooks.current();
        var list = Sources.all().map(function (source) {
            var entry = SourceAccount.row(source, XmltvGuide.subtitle(source));
            return { label: source.name, source: source, current: !!current && source.id === current.id, sub: [entry.detail, refreshedText(source)].filter(Boolean).join(' \u00b7 '), chip: entry.chip, warn: entry.warn, run: function () { open(source, hooks); } };
        });
        list = list.concat(['xtream', 'm3u'].map(function (kind) {
            return { label: I18n.t(kind === 'xtream' ? 'sources.addXtream' : 'sources.addM3u'), add: kind, text: '', run: function () { hooks.add(kind); } };
        }));
        // Lists refresh by themselves once a day; this fetches them now.
        if (current) list.push({ label: I18n.t('sources.refreshNow'), text: '', run: function () { hooks.refresh(current); } });
        list[0].group = I18n.t('rail.sources');
        return list;
    }

    return { rows: rows };
})();
