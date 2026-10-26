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
            root.setAttribute('aria-label', 'Backup');
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
        screen('Backup', message);
        if (retry) button('Try again', retry);
        button('Cancel', close).focus();
    }

    function input(title, message, actions) {
        screen(title, message);
        var label = el('label', 'HTTP or HTTPS link');
        label.htmlFor = 'backup-url';
        root.appendChild(label);
        var field = el('input');
        field.id = 'backup-url';
        field.type = 'url';
        field.placeholder = 'http://192.168.1.10/backup.json';
        root.appendChild(field);
        actions.forEach(function (action) { button(action.label, function () { action.run(field.value.trim()); }); });
        button('Cancel', close);
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
        screen('Import backup', Backup.summary(backup));
        root.appendChild(el('p', 'Replace overwrites your sources and library. Merge keeps existing sources and adds missing items.' +
            (backup.skipped ? ' ' + backup.skipped + ' unsupported sources skipped.' : '')));
        ['Replace', 'Merge'].forEach(function (mode) {
            button(mode, function () {
                screen('Import backup', 'Saving backup\u2026');
                Promise.resolve().then(function () {
                    // Flush the old player before replacing its progress store.
                    Player.stop();
                    return Backup.apply(backup, mode.toLowerCase());
                }).then(function () {
                    location.reload();
                }).catch(function () { error('Could not save backup. Check TV storage and try again.', importLink); });
            });
        });
        button('Cancel', close).focus();
    }

    function fetchImport(url) {
        if (!validUrl(url)) return error('Enter an HTTP or HTTPS link.', importLink);
        screen('Import backup', 'Downloading backup\u2026');
        var mine = ++generation;
        button('Cancel', close).focus();
        request(url).then(function (response) {
            if (mine !== generation) return;
            var backup;
            try { backup = Backup.parse(response.body); } catch (failure) { return error('Invalid or unsupported backup file. Saved data has not changed.', importLink); }
            confirmImport(backup);
        }).catch(function () {
            if (mine === generation) error('Could not download backup. Check the link, network and server CORS permissions. Saved data has not changed.', importLink);
        });
    }

    function importLink() {
        input('Import from link\u2026', 'Enter a direct link to an IPTVnator desktop backup JSON.', [{ label: 'Download', run: fetchImport }]);
    }

    function upload(url, method) {
        if (!validUrl(url)) return error('Enter an HTTP or HTTPS link.', uploadLink);
        screen('Copy to a link\u2026', 'Uploading backup\u2026');
        var mine = ++generation;
        button('Cancel', close).focus();
        request(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: exported }).then(function (response) {
            if (mine !== generation) return;
            var link = response.location ? new URL(response.location, url).href : url;
            return Promise.resolve().then(function () {
                if (!phoneUrl(link)) throw new Error('local-only');
                return request(link);
            }).then(function (saved) {
                if (mine !== generation) return;
                if (JSON.stringify(JSON.parse(saved.body)) !== exported) throw new Error('unverified');
                screen('Backup uploaded', 'Contains your passwords. Open this verified link on your phone:');
                root.appendChild(el('p', link));
                button('Done', close).focus();
            }).catch(function () {
                if (mine !== generation) {
                    return;
                }
                screen('Backup uploaded', 'The endpoint accepted the backup, but no readable phone link could be verified. Check your server.');
                button('Done', close).focus();
            });
        }).catch(function () {
            if (mine === generation) error('Upload failed. Check the endpoint, HTTP method and server CORS permissions.', uploadLink);
        });
    }

    function uploadLink() {
        input('Copy to a link\u2026', 'Contains your passwords. Use only a trusted endpoint that accepts JSON with PUT or POST. Cancelling cannot undo an upload already received.', [
            { label: 'Upload with PUT', run: function (url) { upload(url, 'PUT'); } },
            { label: 'Upload with POST', run: function (url) { upload(url, 'POST'); } },
        ]);
    }

    function showExport() {
        screen('Export backup', 'Preparing backup\u2026');
        var mine = ++generation;
        button('Cancel', close).focus();
        Backup.build().then(function (manifest) {
            if (mine !== generation) return;
            exported = JSON.stringify(manifest);
            var blob = new Blob([exported], { type: 'application/json' });
            download = URL.createObjectURL(blob);
            var size = (blob.size / 1024).toFixed(1);
            screen('Export backup', blob.size > 2953 ? 'Too big for a QR code: ' + size + ' KB' : 'QR code unavailable. Backup size: ' + size + ' KB');
            root.appendChild(el('p', 'Contains your passwords. This TV has no local file server. Use a trusted upload endpoint to get a phone link.'));
            var link = el('a', 'Download JSON on this device');
            link.href = download;
            link.download = 'iptvnator-playlist-backup-' + manifest.exportedAt.slice(0, 10) + '.json';
            root.appendChild(link);
            button('Copy to a link\u2026', uploadLink);
            button('Done', close).focus();
        }).catch(function () {
            if (mine === generation) error('Could not export backup. Check saved data and M3U source connectivity.', showExport);
        });
    }

    function open(action) {
        close();
        if (action === 'import') return importLink();
        screen('Export backup', 'Contains your passwords');
        root.appendChild(el('p', 'Anyone with this backup can use your sources. Share it only with people and servers you trust.'));
        button('Continue', showExport);
        button('Cancel', close).focus();
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
