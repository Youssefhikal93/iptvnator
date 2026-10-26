// Catch-up has no progress id: programmes never enter Continue watching.
window.CatchUp = (function () {
    'use strict';

    function days(channel) {
        var count = Number(channel && channel.tv_archive_duration);
        return isFinite(count) && count >= 1 ? Math.floor(count) : 0;
    }

    function available(channel) {
        return !!channel && !channel.url && Number(channel.stream_id) > 0 &&
            Number(channel.tv_archive) === 1 && days(channel) > 0;
    }

    function playable(channel, programme) {
        var now = Date.now();
        return available(channel) && !!programme && isFinite(programme.start) && isFinite(programme.end) &&
            programme.end > programme.start && programme.start < now && programme.start >= now - days(channel) * 86400000;
    }

    function pad(number) {
        return ('0' + number).slice(-2);
    }

    // One decision for provider time versus the TV's local time, including DST.
    function startTime(time, account) {
        var zone = account.server_info && account.server_info.timezone;
        if (zone) {
            try {
                var parts = {};
                new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit',
                    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
                    .formatToParts(new Date(time)).forEach(function (part) { parts[part.type] = part.value; });
                return parts.year + '-' + parts.month + '-' + parts.day + ':' + parts.hour + '-' + parts.minute;
            } catch (err) {
                if (!(err instanceof RangeError)) throw err;
                // An invalid provider zone is as unusable as a missing one.
            }
        }
        var date = new Date(time);
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ':' +
            pad(date.getHours()) + '-' + pad(date.getMinutes());
    }

    function request(channel, programme, account) {
        if (account.type !== 'xtream' || !playable(channel, programme)) return null;
        var minutes = Math.ceil((programme.end - programme.start) / 60000);
        var url = XtreamSource(account, { quiet: true }).timeshiftUrl(channel.stream_id, minutes, startTime(programme.start, account));
        return {
            live: false,
            title: channel.name + ' \u00b7 ' + programme.title,
            catchUp: { start: programme.start, end: programme.end },
            sources: [{ via: 'mpegts', url: url }, { via: 'hls', url: url }, { via: 'avplay', url: url }],
        };
    }

    function decorate(el, channel) {
        if (!available(channel)) return;
        var badge = document.createElement('span');
        badge.className = 'catch-up-badge';
        badge.textContent = 'Catch-up ' + days(channel) + ' days';
        el.appendChild(badge);
    }

    function clock(time) {
        var date = new Date(time);
        return pad(date.getHours()) + ':' + pad(date.getMinutes());
    }

    return { available: available, days: days, playable: playable, request: request, decorate: decorate, clock: clock };
})();
