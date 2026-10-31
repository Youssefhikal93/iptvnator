// What saving an edited source changes. plan() decides, apply() performs, so every way of editing
// a source (the full form, the guide menu) follows the same rules. The library follows the source account.
window.SourceEdit = (function () {
    'use strict';

    function hostName(url) {
        try {
            return new URL(url).hostname;
        } catch (e) {
            return url;
        }
    }

    // `updated.id` is already resolved: it is the old id unless the edit moved to another source account.
    function plan(old, updated) {
        var rekeyed = old.id !== updated.id;
        // Each guide link (#90) on its own: 'remove', 'refresh' or 'keep'.
        var guides = {};
        [1, 2, 3].forEach(function (n) {
            var url = GuideLinks.url(updated, n);
            var changed = rekeyed || GuideLinks.url(old, n) !== url || old.epgOffset !== updated.epgOffset;
            // Link 1 is always cleared with its address; links 2 and 3 only when they had one.
            var had = n === 1 || GuideLinks.url(old, n);
            guides[n] = !url ? (had ? 'remove' : 'keep') : changed ? 'refresh' : 'keep';
        });
        return {
            source: updated,
            previousId: old.id,
            rekeyed: rekeyed,
            // Another login or server means the saved lists may not be this provider's.
            reconnect: old.url !== updated.url || old.user !== updated.user || old.pass !== updated.pass,
            guide: guides[1],
            guides: guides,
            // The guide is stored under the id; once the source moves to a new id the old one is orphaned.
            staleGuideId: rekeyed ? old.id : null,
            staleLinks: { 2: !!GuideLinks.url(old, 2), 3: !!GuideLinks.url(old, 3) },
        };
    }

    function apply(change) {
        var source = change.source;
        Sources.rekey(change.previousId, source);
        if (change.reconnect) SourceAccount.forget(source.id);
        if (change.staleGuideId) GuideLinks.ids(change.staleGuideId).forEach(function (id, at) {
            if (at === 0 || change.staleLinks[at + 1]) XmltvGuide.remove(id);
        });
        Object.keys(change.guides).forEach(function (n) {
            var link = GuideLinks.link(source, Number(n));
            if (change.guides[n] === 'remove') XmltvGuide.remove(link.id);
            else if (change.guides[n] === 'refresh') XmltvGuide.refresh(link);
        });
    }

    function commit(old, updated) {
        var change = plan(old, updated);
        apply(change);
        return change;
    }

    function edit(source, hooks) {
        return function () {
            hooks.openForm(source, function (updated) {
                if (!updated) return;
                if (!updated.name.trim()) updated.name = hostName(updated.url);
                updated.id = SourceIdentity.resolveId(source, updated);
                hooks.saved(commit(source, updated));
            }, 'source');
        };
    }

    edit.plan = plan;
    edit.commit = commit;
    return edit;
})();
