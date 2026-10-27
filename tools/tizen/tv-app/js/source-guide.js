// Guide actions shared by a source's options menu and its details.
window.SourceGuide = function (source, hooks) {
    'use strict';

    // The same rules as the full form: only a changed guide is downloaded again.
    function save(updated) {
        hooks.changed(SourceEdit.commit(source, updated).source);
    }

    function edit() {
        hooks.openForm(source, function (updated) {
            if (!updated) return;
            save(updated);
        });
    }

    var options = [{ label: I18n.t('guide.link'), run: edit }];
    if (source.epgUrl) {
        if (source.type === 'xtream') options.push({
            label: I18n.t('guide.prefer', { state: I18n.t(source.epgPrefer === false ? 'common.off' : 'common.on') }),
            run: function () { save(Object.assign({}, source, { epgPrefer: source.epgPrefer === false })); },
        });
        options.push({ label: I18n.t('guide.refresh'), run: function () { XmltvGuide.refresh(source); } });
        options.push({ label: I18n.t('guide.remove'), run: function () {
            save(Object.assign({}, source, { epgUrl: '' }));
        } });
    }
    return options;
};
