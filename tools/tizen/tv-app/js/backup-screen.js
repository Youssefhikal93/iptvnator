// Native text entry follows Form's remote navigation; no TV file picker is needed.
window.BackupScreen = (function () {
    'use strict';

    var root = null;
    var download = null;
    var controller = null;
    var generation = 0;
    var exported = null;

    function el(tag, text) {
        var node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function close() {
        generation++;
        if (controller) controller.abort();
        if (download) URL.revokeObjectURL(download);
        controller = null;
        download = null;
        exported = null;
        if (root) root.remove();
        root = null;
    }

    function screen(title, message) {
        if (!root) {
            root = el('section');
            root.id = 'backup-screen';
            root.setAttribute('role', 'dialog');
            root.setAttribute('aria-label', I18n.t('settings.backup'));
            root.setAttribute('aria-modal', 'true');
            document.body.appendChild(root);
        }
        root.textContent = '';
        root.appendChild(el('h1', title));
        root.appendChild(el('p', message));
    }

    function button(label, run) {
        var node = el('button', label);
        node.addEventListener('click', run);
        root.appendChild(node);
        return node;
    }

    function error(message, retry) {
        screen(I18n.t('settings.backup'), message);
        if (retry) button(I18n.t('backup.tryAgain'), retry);
        button(I18n.t('common.cancel'), close).focus();
    }

    function input(title, message, actions) {
        screen(title, message);
        var label = el('label', I18n.t('backup.linkLabel'));
        label.htmlFor = 'backup-url';
        root.appendChild(label);
        var field = el('input');
        field.id = 'backup-url';
        field.type = 'url';
        field.placeholder = 'http://192.168.1.10/backup.json';
        root.appendChild(field);
        actions.forEach(function (action) { button(action.label, function () { action.run(field.value.trim()); }); });
        button(I18n.t('common.cancel'), close);
        field.focus();
    }

    function validUrl(url) {
        try { return /^https?:$/.test(new URL(url).protocol); } catch (failure) { return false; }
    }

    function phoneUrl(url) {
        if (!validUrl(url)) return false;
        // Loopback always points at the device opening it, never at this TV.
        return !/^(localhost\.?|127\..*|\[::1\]|0\.0\.0\.0)$/i.test(new URL(url).hostname);
    }

    function request(url, options) {
        if (!validUrl(url)) return Promise.reject(new Error('link'));
        var activeController = new AbortController();
        controller = activeController;
        options = Object.assign({ credentials: 'omit', referrerPolicy: 'no-referrer' }, options, { signal: activeController.signal });
        var timer = setTimeout(function () { activeController.abort(); }, 15000);
        return fetch(url, options).then(function (response) {
            if (!response.ok) throw new Error('request');
            return response.text().then(function (body) {
                if (new Blob([body]).size > 5 * 1024 * 1024) throw new Error('size');
                return { body: body, location: response.headers.get('Location') };
            });
        }).finally(function () { clearTimeout(timer); });
    }

    function confirmImport(backup) {
        screen(I18n.t('backup.importTitle'), Backup.summary(backup));
        root.appendChild(el('p', I18n.t('backup.replaceHelp') +
            (backup.skipped ? ' ' + I18n.t('backup.skipped', { n: backup.skipped }) : '')));
        ['Replace', 'Merge'].forEach(function (mode) {
            button(I18n.t('backup.' + mode.toLowerCase()), function () {
                screen(I18n.t('backup.importTitle'), I18n.t('backup.saving'));
                Promise.resolve().then(function () {
                    // Flush the old player before replacing its progress store.
                    Player.stop();
                    return Backup.apply(backup, mode.toLowerCase());
                }).then(function () {
                    location.reload();
                }).catch(function () { error(I18n.t('backup.saveFailed'), importLink); });
            });
        });
        button(I18n.t('common.cancel'), close).focus();
    }

    function fetchImport(url) {
        if (!validUrl(url)) return error(I18n.t('backup.enterLink'), importLink);
        screen(I18n.t('backup.importTitle'), I18n.t('backup.downloading'));
        var mine = ++generation;
        button(I18n.t('common.cancel'), close).focus();
        request(url).then(function (response) {
            if (mine !== generation) return;
            var backup;
            try { backup = Backup.parse(response.body); } catch (failure) { return error(I18n.t('backup.invalid'), importLink); }
            confirmImport(backup);
        }).catch(function () {
            if (mine === generation) error(I18n.t('backup.downloadFailed'), importLink);
        });
    }

    function importLink() {
        input(I18n.t('settings.import'), I18n.t('backup.directLink'), [{ label: I18n.t('backup.download'), run: fetchImport }]);
    }

    function upload(url, method) {
        if (!validUrl(url)) return error(I18n.t('backup.enterLink'), uploadLink);
        screen(I18n.t('backup.copyToLink'), I18n.t('backup.uploading'));
        var mine = ++generation;
        button(I18n.t('common.cancel'), close).focus();
        request(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: exported }).then(function (response) {
            if (mine !== generation) return;
            var link = response.location ? new URL(response.location, url).href : url;
            return Promise.resolve().then(function () {
                if (!phoneUrl(link)) throw new Error('local-only');
                return request(link);
            }).then(function (saved) {
                if (mine !== generation) return;
                if (JSON.stringify(JSON.parse(saved.body)) !== exported) throw new Error('unverified');
                screen(I18n.t('backup.uploaded'), I18n.t('backup.openLink'));
                root.appendChild(el('p', link));
                button(I18n.t('backup.done'), close).focus();
            }).catch(function () {
                if (mine !== generation) {
                    return;
                }
                screen(I18n.t('backup.uploaded'), I18n.t('backup.unverified'));
                button(I18n.t('backup.done'), close).focus();
            });
        }).catch(function () {
            if (mine === generation) error(I18n.t('backup.uploadFailed'), uploadLink);
        });
    }

    function uploadLink() {
        input(I18n.t('backup.copyToLink'), I18n.t('backup.uploadWarning'), [
            { label: I18n.t('backup.uploadPut'), run: function (url) { upload(url, 'PUT'); } },
            { label: I18n.t('backup.uploadPost'), run: function (url) { upload(url, 'POST'); } },
        ]);
    }

    function showExport() {
        screen(I18n.t('backup.exportTitle'), I18n.t('backup.preparing'));
        var mine = ++generation;
        button(I18n.t('common.cancel'), close).focus();
        Backup.build().then(function (manifest) {
            if (mine !== generation) return;
            exported = JSON.stringify(manifest);
            var blob = new Blob([exported], { type: 'application/json' });
            download = URL.createObjectURL(blob);
            var size = (blob.size / 1024).toFixed(1);
            screen(I18n.t('backup.exportTitle'), I18n.t(blob.size > 2953 ? 'backup.tooBig' : 'backup.noQr', { size: size }));
            root.appendChild(el('p', I18n.t('backup.noServer')));
            var link = el('a', I18n.t('backup.downloadJson'));
            link.href = download;
            link.download = 'iptvnator-playlist-backup-' + manifest.exportedAt.slice(0, 10) + '.json';
            root.appendChild(link);
            button(I18n.t('backup.copyToLink'), uploadLink);
            button(I18n.t('backup.done'), close).focus();
        }).catch(function () {
            if (mine === generation) error(I18n.t('backup.exportFailed'), showExport);
        });
    }

    function open(action) {
        close();
        if (action === 'import') return importLink();
        screen(I18n.t('backup.exportTitle'), I18n.t('backup.containsPasswords'));
        root.appendChild(el('p', I18n.t('backup.shareWarning')));
        button(I18n.t('backup.continue'), showExport);
        button(I18n.t('common.cancel'), close).focus();
    }

    function onKey(event) {
        var code = event.keyCode;
        if (Keys.isBack(code)) { close(); return event.preventDefault(); }
        var controls = Array.prototype.slice.call(root.querySelectorAll('input, button, a'));
        var index = controls.indexOf(document.activeElement);
        var onInput = document.activeElement && document.activeElement.tagName === 'INPUT';
        var step = code === Keys.UP ? -1 : code === Keys.DOWN ? 1 : !onInput && code === Keys.LEFT ? -1 : !onInput && code === Keys.RIGHT ? 1 : 0;
        if (step && controls.length) {
            controls[Math.max(0, Math.min(controls.length - 1, index + step))].focus();
            event.preventDefault();
        }
    }

    return { open: open, onKey: onKey, isOpen: function () { return root !== null; } };
})();
