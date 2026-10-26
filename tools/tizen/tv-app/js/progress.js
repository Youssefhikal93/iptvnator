// The existing progress store is shared by playback and the library.
window.Progress = (function () {
    'use strict';

    var KEY = 'iptvnator-tv:progress';
    var RESUME_MIN_S = 30;
    var FINISHED_MARGIN_S = 30;

    function read() {
        try {
            return JSON.parse(localStorage.getItem(KEY)) || {};
        } catch (e) {
            return {};
        }
    }

    function write(records) {
        try {
            localStorage.setItem(KEY, JSON.stringify(records));
        } catch (e) {
            // Storage full or unavailable; playback can still continue.
        }
    }

    function episodeId(episode) {
        return episode.id === undefined || episode.id === null ? undefined : 'episode:' + episode.id;
    }

    function id(section, item) {
        if (item.episode) return episodeId(item.episode);
        if (section === 'movies' && item.stream_id !== undefined) return 'movie:' + item.stream_id;
        return item.progressId;
    }

    // Zero/unknown lengths cannot finish. Explicit marks use a positive full record.
    function finished(position, duration) {
        return duration > 0 && position > 0 && (position >= duration * 0.95 || duration - position < FINISHED_MARGIN_S);
    }

    function of(id) {
        if (id === undefined || id === null) return null;
        var saved = read()[String(id)];
        if (!saved || !(saved.position > 0) || !(saved.duration > 0) || !isFinite(saved.position) || !isFinite(saved.duration)) return null;
        return {
            position: saved.position,
            duration: saved.duration,
            ratio: Math.min(1, saved.position / saved.duration),
            updatedAt: saved.updatedAt || 0,
            status: finished(saved.position, saved.duration) ? 'watched' : 'continue',
        };
    }

    function fullRecord(duration) {
        var seconds = isFinite(duration) && duration > 0 ? duration : 1;
        return { position: seconds, duration: seconds, updatedAt: Date.now() };
    }

    // Playback advances its save timer only when the position qualifies.
    function save(id, position, duration) {
        if (id === undefined || id === null || !(duration > 0) || !isFinite(duration) || !isFinite(position)) return;
        var done = finished(position, duration);
        position = Math.floor(position);
        duration = Math.floor(duration);
        // Whole-second storage must not turn an unfinished write into a watched read.
        done = done || finished(position, duration);
        if (!done && position < 5) return;
        var records = read();
        records[String(id)] = done ? fullRecord(duration) : { position: position, duration: duration, updatedAt: Date.now() };
        write(records);
        return true;
    }

    function finish(id, duration) {
        if (id === undefined || id === null) return;
        var records = read();
        records[String(id)] = fullRecord(Math.max(1, Math.floor(duration || 0)));
        write(records);
    }

    function mark(ids, watched, durations) {
        var records = read();
        ids.forEach(function (id, index) {
            if (id === undefined || id === null) return;
            var saved = records[String(id)];
            var duration = Number(saved && saved.duration);
            if (!(duration > 0) || !isFinite(duration)) duration = Number(durations && durations[index]);
            if (watched) records[String(id)] = fullRecord(duration);
            else delete records[String(id)];
        });
        write(records);
    }

    function isWatched(id) {
        var saved = of(id);
        return !!saved && saved.status === 'watched';
    }

    function unfinished(section, item) {
        var saved = of(id(section, item));
        return saved && saved.status === 'continue' ? saved : null;
    }

    function resumeFrom(id, duration) {
        var saved = of(id);
        if (!saved || saved.status === 'watched' || saved.position < RESUME_MIN_S) return 0;
        return finished(saved.position, duration) ? 0 : saved.position;
    }

    return {
        id: id,
        episodeId: episodeId,
        of: of,
        save: save,
        finish: finish,
        mark: mark,
        clear: function (id) { mark([id], false); },
        resumeFrom: resumeFrom,
        isWatched: isWatched,
        unfinished: unfinished,
        allWatched: function (episodes) {
            return !!episodes && episodes.length > 0 && episodes.every(function (episode) {
                return isWatched(episodeId(episode));
            });
        },
        bar: function (ratio) { return Math.max(3, Math.round(ratio * 100)) + '%'; },
    };
})();
