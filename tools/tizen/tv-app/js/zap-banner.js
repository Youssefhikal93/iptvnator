// The channel banner (#79): on every channel change (▲▼, the previous-channel
// key, a pick in the drawer) a slim strip at the bottom for about 4 s with
// the channel's plate, number and name, the programme on now with its
// progress and times, and the next one. The player hides it on any other
// key; OK or Info there opens the full controls instead.
//
// hooks: programmes() -> { loading, now, next } (player-epg.js);
//   startOver() -> whether the programme on now can start over (catch-up).
window.ZapBanner = (() => {
    'use strict';

    const SHOW_MS = 4000;
    const { html } = UI;

    // How far the programme is, 0 to 100.
    const progress = (programme, now) => {
        const length = programme.end - programme.start;
        return length > 0 ? Math.max(0, Math.min(100, ((now - programme.start) / length) * 100)) : 0;
    };

    const Row = ({ tag, programme, left }) => html`<div class="pl-epg-row">
        <span class="pl-epg-tag">${tag}</span>
        <span class="pl-epg-time">${I18n.time(programme.start) + ' – ' + I18n.time(programme.end)}</span>
        <span class="pl-epg-title">${programme.title}</span>
        ${left ? html`<span class="pl-epg-left">${left}</span>` : null}
    </div>`;

    const Key = ({ cap, label }) => html`<span><b>${cap}</b>${label}</span>`;

    // channel: { name, num, logo }; guide: { loading, now, next }; now: the clock.
    const view = (channel, guide, now, canStartOver) => {
        const on = guide.now;
        const empty = !on && !guide.loading;
        return html`<div class="zb">
            <${Kit.Plate} cls="zb-plate" name=${channel.name || '?'} logo=${channel.logo || ''} />
            <div class="zb-body">
                <div class="zb-head">
                    ${channel.num ? html`<span class="zb-num">${channel.num}</span>` : null}
                    <span class="zb-name">${channel.name}</span>
                    <span class="zb-clock">${I18n.time(now)}</span>
                </div>
                ${on ? html`<${Row} tag=${I18n.t('epg.now')} programme=${on} left=${I18n.t('epg.minLeft', { m: Math.max(1, Math.round((on.end - now) / 60000)) })} />
                    <div class="pl-epg-bar"><div class="pl-epg-fill" style=${{ width: progress(on, now) + '%' }}></div></div>` : null}
                ${on && guide.next ? html`<${Row} tag=${I18n.t('epg.next')} programme=${guide.next} />` : null}
                ${empty ? html`<div class="zb-empty">${I18n.t('player.banner.noProgramme')}</div>` : null}
                <div class="zb-keys">
                    <${Key} cap="OK" label=${I18n.t('player.hint.info')} />
                    ${canStartOver ? html`<${Key} cap="▶" label=${I18n.t('player.startOver')} />` : null}
                </div>
            </div>
        </div>`;
    };

    const create = (root, hooks) => {
        let channel = null;
        let timer = null;

        const render = () => {
            if (!channel) return UI.clear(root);
            UI.render(view(channel, hooks.programmes(), Date.now(), hooks.startOver()), root);
        };

        // A key hides it at once; the timer lets it slide down, unless
        // Animations are Off.
        const hide = (slide) => {
            clearTimeout(timer);
            timer = null;
            channel = null;
            const gone = () => {
                root.classList.add('hidden');
                root.classList.remove('zb-out');
                render();
            };
            if (slide !== true || document.documentElement.getAttribute('data-motion') === 'off') return gone();
            root.classList.add('zb-out');
            timer = setTimeout(gone, 250);
        };

        return {
            // Shows the channel's banner, or keeps it 4 s more.
            show: (shown) => {
                channel = shown;
                clearTimeout(timer);
                timer = setTimeout(() => hide(true), SHOW_MS);
                root.classList.remove('hidden', 'zb-out');
                render();
            },
            hide: () => hide(false),
            // The guide's answer arrived, or the channel became playable.
            refresh: () => {
                if (channel) render();
            },
            shown: () => !!channel,
        };
    };

    return { create, view, progress, SHOW_MS };
})();
