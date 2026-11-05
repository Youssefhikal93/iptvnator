// The player's Quality choices (#94), first in the Settings panel and only
// when there is a choice: the provider's copies of what is playing (see
// quality.js), or else the resolutions of an adaptive HLS stream.
// hooks: current() the request, hls() the hls.js player or null,
// switchTo(request) reopens on another copy where it was.
window.PlayerQuality = function (hooks) {
    'use strict';

    function t(key, values) { return I18n.t('player.quality.' + key, values); }

    function keyOf(req) {
        return (req.quality && req.quality.key) || req.channel || req.subtitleId || req.id || '';
    }

    // One entry per picture height, best first.
    function levels() {
        var lib = hooks.hls();
        if (!lib || !lib.levels || lib.levels.length < 2) return [];
        var byHeight = {};
        lib.levels.forEach(function (level, index) {
            var height = Number(level.height) || 0;
            if (!height) return;
            var kept = byHeight[height];
            if (!kept || (level.bitrate || 0) > (lib.levels[kept.index].bitrate || 0)) byHeight[height] = { height: height, index: index };
        });
        var list = Object.keys(byHeight).map(function (height) { return byHeight[height]; });
        return list.length < 2 ? [] : list.sort(function (a, b) { return b.height - a.height; });
    }

    function playingHeight(lib) {
        var level = lib.levels[lib.currentLevel];
        return level && level.height ? level.height + 'p' : '';
    }

    function auto(shown) {
        return shown ? t('autoWith', { quality: shown }) : t('auto');
    }

    function switchCopy(req, copy, isAuto) {
        var q = req.quality;
        if (copy.tag === q.tag) {
            q.auto = isAuto;
            return;
        }
        hooks.switchTo(Object.assign({}, req, {
            sources: copy.sources,
            quality: Object.assign({}, q, { tag: copy.tag, auto: isAuto }),
            qualityFallback: { tag: q.tag, auto: q.auto, sources: req.sources },
        }));
    }

    function copyEntries(head, item, req, copies) {
        var q = req.quality;
        head(t('title'));
        item(auto(Quality.label(q.auto ? q.tag : Quality.choose(null, copies, q.own).copy.tag)), q.auto, function () {
            Quality.remember(q.key, null);
            switchCopy(req, Quality.choose(null, copies, q.own).copy, true);
        });
        copies.forEach(function (copy) {
            item(Quality.label(copy.tag), !q.auto && copy.tag === q.tag, function () {
                Quality.remember(q.key, copy.tag);
                switchCopy(req, copy, false);
            });
        });
    }

    function levelEntries(head, item, req, list) {
        var lib = hooks.hls();
        var isAuto = lib.autoLevelEnabled !== false;
        head(t('title'));
        item(auto(playingHeight(lib)), isAuto, function () {
            Quality.remember(keyOf(req), null);
            lib.currentLevel = -1;
        });
        list.forEach(function (level) {
            item(level.height + 'p', !isAuto && lib.currentLevel === level.index, function () {
                Quality.remember(keyOf(req), level.height + 'p');
                lib.currentLevel = level.index;
            });
        });
    }

    return {
        menuEntries: function (head, item) {
            var req = hooks.current();
            if (!req) return;
            var copies = req.quality ? req.quality.copies() : [];
            if (copies.length > 1) return copyEntries(head, item, req, copies);
            var list = levels();
            if (list.length > 1) levelEntries(head, item, req, list);
        },
        // A remembered resolution applies once the stream lists its own.
        applyLevel: function () {
            var req = hooks.current();
            var tag = req && Quality.picked(keyOf(req));
            if (!tag || !/^\d+p$/.test(tag)) return;
            var level = levels().filter(function (entry) { return entry.height + 'p' === tag; })[0];
            if (level) hooks.hls().currentLevel = level.index;
        },
    };
};
