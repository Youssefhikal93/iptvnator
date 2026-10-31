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

    function label(key) {
        return key === 'provider' ? I18n.t('guide.provider') : I18n.t('guide.linkN', { n: key }) + ' · ' + GuideLinks.host(GuideLinks.url(source, Number(key)));
    }

    // The guides in the order they are asked (#90); OK on one moves it.
    function order(current, focus) {
        var keys = GuideLinks.order(current);
        Menu.open(I18n.t('guide.order'), keys.map(function (key, at) {
            return { label: (at + 1) + '. ' + label(key), run: function () { moveMenu(current, key); } };
        }), focus || 0);
    }

    function moveMenu(current, key) {
        var at = GuideLinks.order(current).indexOf(key);
        function step(by) {
            return function () {
                var updated = GuideLinks.move(current, key, by);
                save(updated);
                source = updated;
                order(updated, at + by);
            };
        }
        var rows = [];
        if (at > 0) rows.push({ label: I18n.t('guide.moveUp'), run: step(-1) });
        if (at < GuideLinks.order(current).length - 1) rows.push({ label: I18n.t('guide.moveDown'), run: step(1) });
        rows.push({ label: I18n.t('common.back'), run: function () { order(current, at); } });
        Menu.open(label(key), rows);
    }

    var options = [{ label: I18n.t('guide.link'), run: edit }];
    if (GuideLinks.any(source)) {
        if (GuideLinks.order(source).length > 1) options.push({ label: I18n.t('guide.order'), run: function () { order(source); } });
        options.push({ label: I18n.t('guide.refresh'), run: function () {
            GuideLinks.links(source).forEach(function (link) { XmltvGuide.refresh(link); });
        } });
        options.push({ label: I18n.t('guide.remove'), run: function () {
            save(Object.assign({}, source, { epgUrl: '', epgUrl2: '', epgUrl3: '' }));
        } });
    }
    return options;
};
