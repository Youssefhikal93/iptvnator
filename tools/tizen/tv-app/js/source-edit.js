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
        var guideChanged = rekeyed || old.epgUrl !== updated.epgUrl || old.epgOffset !== updated.epgOffset;
        return {
            source: updated,
            previousId: old.id,
            rekeyed: rekeyed,
            // Another login or server means the saved lists may not be this provider's.
            reconnect: old.url !== updated.url || old.user !== updated.user || old.pass !== updated.pass,
            guide: !updated.epgUrl ? 'remove' : guideChanged ? 'refresh' : 'keep',
            // The guide is stored under the id; once the source moves to a new id the old one is orphaned.
            staleGuideId: rekeyed ? old.id : null,
        };
    }

    function apply(change) {
        var source = change.source;
        Sources.rekey(change.previousId, source);
        if (change.reconnect) SourceAccount.forget(source.id);
        if (change.staleGuideId) XmltvGuide.remove(change.staleGuideId);
        if (change.guide === 'remove') XmltvGuide.remove(source.id);
        else if (change.guide === 'refresh') XmltvGuide.refresh(source);
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
