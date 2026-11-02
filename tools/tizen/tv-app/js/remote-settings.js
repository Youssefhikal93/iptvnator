window.RemoteSettings = (function () {
    'use strict';
    var phones = [];
    var redraw = null;
    var panel = null;
    var expires = 0;
    var timer = null;
    var pairCount = 0;
    function t(key, values) { return I18n.t('remote.' + key, values); }
    function fail() { if (panel) panel.querySelector('p').textContent = I18n.t('phone.unavailable'); }
    function close() {
        clearTimeout(timer);
        if (panel) panel.remove();
        panel = null;
        if (redraw) redraw();
    }
    function note() {
        if (panel) panel.querySelector('p').textContent = Date.now() >= expires ? I18n.t('phone.expired') : t('pairNote', { n: phones.length });
    }
    function pair() {
        PhoneRemote.connect();
        close();
        panel = document.createElement('div');
        panel.id = 'remote-pair';
        panel.className = 'pf-dialog';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        var title = panel.appendChild(document.createElement('h1'));
        title.textContent = t('pair');
        panel.appendChild(document.createElement('div')).textContent = t('scan');
        var qr = panel.appendChild(document.createElement('canvas'));
        qr.id = 'remote-qr';
        qr.style.background = '#fff';
        var address = panel.appendChild(document.createElement('div'));
        address.id = 'remote-url';
        address.style.direction = 'ltr';
        address.style.fontSize = '24px';
        panel.appendChild(document.createElement('p')).textContent = I18n.t('phone.waiting');
        var cancel = panel.appendChild(document.createElement('button'));
        cancel.textContent = I18n.t('common.cancel');
        cancel.onclick = close;
        document.body.appendChild(panel);
        cancel.focus();
        var mine = panel;
        PhoneRemote.call('/app/pair', {}).then(function (code) {
            if (panel !== mine) return;
            expires = Date.now() + code.ttl;
            pairCount = code.count;
            Qr.draw(qr, code.url, 6);
            address.textContent = code.url;
            note();
            timer = setTimeout(note, code.ttl);
        }).catch(fail);
    }
    function change(path, request) {
        PhoneRemote.call(path, request).catch(function () { ProfileDialog.open({ title: t('title'), text: I18n.t('phone.unavailable') }); });
    }
    function actions(phone) {
        return [
            { label: t('rename'), icon: 'edit', run: function () {
                ProfileDialog.open({ title: t('rename'), value: phone.name, inputLabel: t('name'), validate: function (text) { return text.trim() ? '' : t('needName'); },
                    done: function (text) { if (text !== null) change('/app/rename', { id: phone.id, name: text }); } });
            } },
            { label: t('forget'), icon: 'trash', destructive: true, run: function () { change('/app/forget', { id: phone.id }); } },
        ];
    }
    function rows(render) {
        redraw = render;
        var list = [{ get group() { return t('general'); }, get part() { return t('settingsTitle'); }, get label() { return t('pair'); }, get hint() { return t('limits'); }, icon: 'add', run: pair, text: function () { return t('count', { n: phones.length }); } }];
        phones.forEach(function (phone, index) {
            list.push({ part: index === 0 ? t('paired') : null, icon: 'phone', label: phone.name, hint: t('lastUsed', { time: I18n.date(phone.lastUsed, { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + I18n.time(phone.lastUsed) }), actions: actions(phone) });
        });
        list.push({ label: t('forgetAll'), destructive: true, compactAction: true, icon: 'trash', text: '', run: function () {
            ProfileDialog.open({ title: t('forgetAll'), text: t('forgetAllText'), ok: t('forgetAll'), destructive: true, done: function (yes) { if (yes) change('/app/forget', { id: 'all' }); } });
        } });
        return list;
    }
    function update(next) {
        if (JSON.stringify(phones) === JSON.stringify(next)) return;
        phones = next;
        if (panel) {
            if (phones.length > pairCount) { panel.querySelector('canvas').hidden = true; panel.querySelector('#remote-url').textContent = t('pairedNow'); }
            note();
        }
        if (redraw && document.getElementById('content').classList.contains('settings')) redraw();
    }
    return { rows: rows, update: update, isOpen: function () { return !!panel; }, onKey: function (event) {
        if (Keys.isBack(event.keyCode) || event.keyCode === Keys.ENTER) close();
        event.preventDefault();
    } };
})();
