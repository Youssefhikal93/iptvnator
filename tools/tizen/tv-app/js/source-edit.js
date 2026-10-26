// "Edit source…": the add form, filled in. The source keeps its id, so its
// library, progress and guide stay attached.
window.SourceEdit = function (source, hooks) {
    'use strict';

    function hostName(url) {
        try {
            return new URL(url).hostname;
        } catch (e) {
            return url;
        }
    }

    return function () {
        hooks.openForm(source, function (updated) {
            if (!updated) return;
            if (!updated.name.trim()) updated.name = hostName(updated.url);
            // Another login or server means the saved lists may not be this provider's.
            var reconnect = source.url !== updated.url || source.user !== updated.user || source.pass !== updated.pass;
            var guideChanged = source.epgUrl !== updated.epgUrl || source.epgOffset !== updated.epgOffset;
            Sources.update(updated);
            if (reconnect) SourceAccount.forget(updated.id);
            if (!updated.epgUrl) XmltvGuide.remove(updated.id);
            else if (guideChanged) XmltvGuide.refresh(updated);
            hooks.saved(updated, reconnect);
        }, 'source');
    };
};
