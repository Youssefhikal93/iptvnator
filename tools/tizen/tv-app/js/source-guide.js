// Guide actions shared by a source's options menu and its details.
window.SourceGuide = function (source, hooks) {
    'use strict';

    function save(updated) {
        Sources.update(updated);
        hooks.changed(updated);
    }

    function edit() {
        hooks.openForm(source, function (updated) {
            if (!updated) return;
            var changed = source.epgUrl !== updated.epgUrl || source.epgOffset !== updated.epgOffset;
            save(updated);
            if (!updated.epgUrl) XmltvGuide.remove(source.id);
            else if (changed) XmltvGuide.refresh(updated);
        });
    }

    var options = [{ label: 'Guide link\u2026', run: edit }];
    if (source.epgUrl) {
        if (source.type === 'xtream') options.push({
            label: 'Prefer my guide: ' + (source.epgPrefer === false ? 'Off' : 'On'),
            run: function () { save(Object.assign({}, source, { epgPrefer: source.epgPrefer === false })); },
        });
        options.push({ label: 'Refresh guide', run: function () { XmltvGuide.refresh(source); } });
        options.push({ label: 'Remove guide link', run: function () {
            save(Object.assign({}, source, { epgUrl: '' }));
            XmltvGuide.remove(source.id);
        } });
    }
    return options;
};
