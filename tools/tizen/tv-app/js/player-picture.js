// Settings and the player menu share one saved choice for each picture control.
window.PlayerPicture = (function () {
    'use strict';

    var rows = [
        { get group() { return I18n.t('picture.subtitles'); }, get label() { return I18n.t('picture.size'); }, key: 'subtitleSize', choices: ['s', 'm', 'l', 'xl'], get labels() { return [I18n.t('picture.small'), I18n.t('picture.medium'), I18n.t('picture.large'), I18n.t('picture.xlarge')]; }, prefix: 'sub-size-' },
        { get label() { return I18n.t('picture.textColour'); }, get menuLabel() { return I18n.t('picture.colour'); }, key: 'subtitleColour', choices: ['white', 'yellow'], get labels() { return [I18n.t('picture.white'), I18n.t('picture.yellow')]; }, prefix: 'sub-colour-' },
        { get label() { return I18n.t('picture.background'); }, key: 'subtitleBackground', choices: ['off', 'shadow', 'box', 'cover'], get labels() { return [I18n.t('common.off'), I18n.t('picture.shadow'), I18n.t('picture.box'), I18n.t('picture.cover')]; }, prefix: 'sub-bg-' },
        { get label() { return I18n.t('picture.position'); }, key: 'subtitlePosition', choices: ['bottom', 'high'], get labels() { return [I18n.t('picture.bottom'), I18n.t('picture.higher')]; }, prefix: 'sub-pos-' },
        { get group() { return I18n.t('picture.picture'); }, get label() { return I18n.t('picture.aspect'); }, key: 'pictureAspect', choices: ['auto', 'fit', 'fill', '16:9', '4:3'], get labels() { return [I18n.t('picture.auto'), I18n.t('picture.fit'), I18n.t('picture.fill'), '16:9', '4:3']; } },
    ];
    var target;

    function choice(row, value) {
        var index = row.choices.indexOf(value);
        return index < 0 ? row.choices.indexOf(Prefs.getDefault(row.key)) : index;
    }

    function settings() {
        var saved = {};
        rows.forEach(function (row) { saved[row.key] = Prefs.get(row.key); });
        return saved;
    }

    function classes(saved) {
        return rows.filter(function (row) { return row.prefix; }).map(function (row) {
            return row.prefix + row.choices[choice(row, saved[row.key])];
        });
    }

    function aspect(mode, screen, preview) {
        var rect = { x: screen.x, y: screen.y, w: screen.w, h: screen.h };
        var forced = mode === '16:9' || mode === '4:3';
        if (preview) return { rect: preview, objectFit: 'contain', displayMethod: 'PLAYER_DISPLAY_MODE_LETTER_BOX' };
        if (forced) {
            var ratio = mode === '16:9' ? 16 / 9 : 4 / 3;
            rect.w = Math.min(screen.w, Math.round(screen.h * ratio));
            rect.h = Math.min(screen.h, Math.round(screen.w / ratio));
            rect.x += Math.round((screen.w - rect.w) / 2);
            rect.y += Math.round((screen.h - rect.h) / 2);
        }
        return {
            rect: rect,
            objectFit: forced ? 'fill' : mode === 'fill' ? 'cover' : 'contain',
            displayMethod: forced || mode === 'fill' ? 'PLAYER_DISPLAY_MODE_FULL_SCREEN' : 'PLAYER_DISPLAY_MODE_LETTER_BOX',
        };
    }

    function applyClasses(saved) {
        rows.forEach(function (row) {
            if (!row.prefix) return;
            row.choices.forEach(function (value) { target.root.classList.remove(row.prefix + value); });
        });
        classes(saved).forEach(function (name) { target.root.classList.add(name); });
    }

    function positionCues() {
        var tracks = target.video.textTracks;
        var line = Prefs.get('subtitleBackground') === 'cover' ? (Prefs.get('subtitlePosition') === 'high' ? 70 : 86) : Prefs.get('subtitlePosition') === 'high' ? 75 : 90;
        for (var i = 0; i < tracks.length; i++) {
            var track = tracks[i];
            if (track.mode !== 'showing' || (track.kind !== 'subtitles' && track.kind !== 'captions')) continue;
            var cues = track.activeCues || [];
            for (var j = 0; j < cues.length; j++) {
                cues[j].snapToLines = false;
                cues[j].line = line;
            }
        }
    }

    function listenTracks() {
        var tracks = target.video.textTracks;
        for (var i = 0; i < tracks.length; i++) tracks[i].addEventListener('cuechange', positionCues);
        positionCues();
    }

    function applyVideo(picture, preview) {
        var rect = picture.rect;
        var style = target.video.style;
        style.objectFit = picture.objectFit;
        style.left = preview ? '0px' : rect.x + 'px';
        style.top = preview ? '0px' : rect.y + 'px';
        style.width = rect.w + 'px';
        style.height = rect.h + 'px';
    }

    function applyAv(picture, screen) {
        var av = target.avplay();
        if (!av || av.getState() === 'NONE') return;
        var rect = picture.rect;
        try {
            // AVPlay always uses 1920x1080 coordinates, even at another app resolution.
            av.setDisplayRect(Math.round(rect.x * 1920 / screen.w), Math.round(rect.y * 1080 / screen.h),
                Math.round(rect.w * 1920 / screen.w), Math.round(rect.h * 1080 / screen.h));
            av.setDisplayMethod(picture.displayMethod);
        } catch (e) {
            // Firmware can reject display changes while preparing; onReady retries.
            Log.error('Picture display failed (' + e.name + ')');
        }
    }

    function apply() {
        var saved = settings();
        var screen = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
        var preview = target.box();
        var picture = aspect(saved.pictureAspect, screen, preview);
        applyClasses(saved);
        applyVideo(picture, preview);
        applyAv(picture, screen);
        positionCues();
    }

    function cycle(row) {
        var index = choice(row, Prefs.get(row.key));
        Prefs.set(row.key, row.choices[(index + 1) % row.choices.length]);
    }

    function menuEntries(head, item) {
        rows.forEach(function (row) {
            if (row.group) head(row.key === 'subtitleSize' ? I18n.t('picture.subtitleStyle') : row.group);
            item((row.menuLabel || row.label) + ': ' + row.labels[choice(row, Prefs.get(row.key))], false, function () { cycle(row); });
        });
    }

    function init(hooks) {
        target = hooks;
        Prefs.onChange(function (key) {
            if (rows.some(function (row) { return row.key === key; })) apply();
        });
        target.video.textTracks.addEventListener('addtrack', listenTracks);
        target.video.textTracks.addEventListener('change', listenTracks);
        target.video.addEventListener('loadedmetadata', listenTracks);
        window.addEventListener('resize', apply);
        listenTracks();
        apply();
    }

    return { init: init, apply: apply, rows: rows, classes: classes, aspect: aspect, menuEntries: menuEntries };
})();
