// Background XMLTV downloads are serialized; failed staging preserves the saved guide.
window.XmltvGuide = (function () {
    'use strict';

    var PREFIX = 'iptvnator-tv:guide:';
    var FRESH = 12 * 3600000;
    var queue = [];
    var active = null;
    var jobs = Object.create(null);
    var revisions = Object.create(null);
    var listeners = [];

    function status(id) {
        try {
            var saved = JSON.parse(Stored.text(PREFIX + id));
            return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
        }
        catch (e) { return {}; }
    }

    function notify(id, value) {
        try { Stored.save(PREFIX + id, value); }
        catch (e) { Log.error('Guide status could not be saved'); }
        listeners.forEach(function (listener) { listener(id); });
    }

    function download(job) {
        var source = job.source;
        var generation = Date.now() + '-' + Math.random();
        var index = { ids: Object.create(null), names: Object.create(null) };
        var rows = [];
        var channels = 0;
        var programmes = 0;
        var published = false;
        var timeout = setTimeout(function () { job.controller.abort(); }, 600000);
        var parser = XmltvParser.create({ now: Date.now(), offset: Number(source.epgOffset) || 0, emit: function (kind, record) {
            if (kind === 'channel') {
                var id = record.id.toLowerCase();
                index.ids[id] = id;
                record.names.forEach(function (name) {
                    var key = XmltvParser.normalName(name);
                    if (key && !index.names[key]) index.names[key] = id;
                });
                channels++;
            } else {
                rows.push({ source: source.id, generation: generation, channel: record.channel.toLowerCase(), sequence: programmes++, title: record.title, desc: record.desc, start: record.start, end: record.end });
            }
        } });

        function flush() {
            if (job.cancelled) return Promise.reject(new Error('Guide cancelled'));
            if (rows.length < 250) return Promise.resolve();
            return XmltvStore.batch(rows.splice(0, 250)).then(flush);
        }

        function read(reader) {
            return reader.read().then(function (part) {
                if (part.done) {
                    parser.end();
                    return flush().then(function () { if (rows.length) return XmltvStore.batch(rows.splice(0)); });
                }
                parser.write(part.value);
                return flush().then(function () { return read(reader); });
            });
        }

        return fetch(source.epgUrl, { signal: job.controller.signal }).then(function (response) {
            if (!response.ok || !response.body) throw new Error('Guide HTTP failure');
            return XmltvParser.textStream(response.body);
        }).then(function (stream) {
            job.reader = stream.getReader();
            return read(job.reader);
        }).then(function () {
            if (job.cancelled) throw new Error('Guide cancelled');
            if (!channels) throw new Error('Guide has no channels');
            return XmltvStore.publish({ source: source.id, generation: generation, index: index });
        }).then(function () {
            published = true;
            if (job.cancelled) return;
            revisions[source.id] = (revisions[source.id] || 0) + 1;
            notify(source.id, { updatedAt: Date.now(), state: 'ready', channels: channels, programmes: programmes, nameRules: XmltvParser.NAME_RULES });
        }).catch(function () {
            if (job.reader) job.reader.cancel().catch(function () {});
            if (job.cancelled) return;
            var old = status(source.id);
            old.state = 'failed';
            // A failed download waits as long as a good one before the next automatic try.
            old.failedAt = Date.now();
            notify(source.id, old);
            // Fetch errors may contain credentials; emit only the host.
            var host = '';
            try { host = new URL(source.epgUrl).host; } catch (e) { host = 'invalid link'; }
            Log.error('GUIDE FAIL ' + host);
        }).then(function () {
            clearTimeout(timeout);
            if (job.cancelled && published) return;
            return published ? XmltvStore.prune(source.id, generation) : XmltvStore.discard(source.id, generation);
        }).catch(function () { Log.error('Guide staging cleanup failed'); });
    }

    function pump() {
        if (active || !queue.length) return;
        var player = document.getElementById('player');
        var starting = document.getElementById('pl-status');
        if (player && !player.classList.contains('hidden') && starting && !starting.classList.contains('hidden') && !starting.classList.contains('error')) {
            setTimeout(pump, 1000);
            return;
        }
        active = queue.shift();
        var job = active;
        var old = status(job.source.id);
        old.state = 'updating';
        notify(job.source.id, old);
        download(job).then(function () {
            delete jobs[job.source.id];
            active = null;
            job.resolve();
            pump();
        });
    }

    function refresh(source) {
        if (!source.epgUrl) return Promise.resolve();
        var previous = jobs[source.id];
        if (previous) {
            if (previous.source.epgUrl === source.epgUrl && previous.source.epgOffset === source.epgOffset) return previous.promise;
            previous.cancelled = true;
            previous.controller.abort();
            return previous.promise.then(function () { return refresh(source); });
        }
        var job = { source: source, controller: new AbortController(), cancelled: false };
        job.promise = new Promise(function (resolve) { job.resolve = resolve; });
        jobs[source.id] = job;
        queue.push(job);
        setTimeout(pump, 0);
        return job.promise;
    }

    function guide(source) {
        return { name: 'XMLTV', programmes: function (channel) {
            var pending = jobs[source.id];
            return (pending ? pending.promise : Promise.resolve()).then(function () {
                return XmltvStore.programmes(source, channel);
            });
        } };
    }

    // Automatic downloads at most every 12 hours, counting failed ones;
    // Settings > Refresh guide still downloads at once.
    // A guide saved before the name rules last changed (#90) is downloaded
    // again at once, so its channels pair by the new rules.
    guide.ensure = function (source) {
        var saved = status(source.id);
        var last = Math.max(saved.updatedAt || 0, saved.failedAt || 0);
        var oldNames = saved.state === 'ready' && saved.nameRules !== XmltvParser.NAME_RULES;
        if (source.epgUrl && (oldNames || Date.now() - last >= FRESH)) refresh(source);
    };
    // Something that changes which programmes a channel gets, such as a
    // guide channel chosen by hand (#90), without a download.
    guide.touch = function (id) {
        revisions[id] = (revisions[id] || 0) + 1;
        listeners.forEach(function (listener) { listener(id); });
    };
    guide.refresh = refresh;
    // When the guide last downloaded, and when a download last failed.
    guide.times = function (id) {
        var saved = status(id);
        return { updatedAt: saved.updatedAt || 0, failedAt: saved.failedAt || 0 };
    };
    guide.revision = function (id) { return revisions[id] || 0; };
    guide.onChange = function (listener) { listeners.push(listener); };
    guide.remove = function (id) {
        var job = jobs[id];
        if (job) { job.cancelled = true; job.controller.abort(); }
        if (job && job !== active) {
            queue.splice(queue.indexOf(job), 1);
            delete jobs[id];
            job.resolve();
        }
        return (job ? job.promise : Promise.resolve()).then(function () {
            return XmltvStore.remove(id);
        }).then(function () {
            Stored.remove(PREFIX + id);
            revisions[id] = (revisions[id] || 0) + 1;
            listeners.forEach(function (listener) { listener(id); });
        }).catch(function () { Log.error('Guide could not be removed'); });
    };
    function linkText(link) {
        var saved = status(link.id);
        if (saved.state === 'updating' && jobs[link.id]) return I18n.t('guide.updating');
        if (saved.state === 'failed') return I18n.t('guide.failed');
        if (!saved.updatedAt || Date.now() - saved.updatedAt >= FRESH) return I18n.t('guide.stale');
        return I18n.t('guide.updated', { time: I18n.time(saved.updatedAt) });
    }

    // One line for all of a source's links (#90): one still downloading, then
    // the ones that failed by number, else how the first one stands.
    guide.subtitle = function (source) {
        var links = GuideLinks.links(source);
        if (links.length < 2) return links.length ? linkText(links[0]) : '';
        if (links.some(function (link) { return status(link.id).state === 'updating' && jobs[link.id]; })) return I18n.t('guide.updating');
        var failed = links.filter(function (link) { return status(link.id).state === 'failed'; });
        if (failed.length) return I18n.t('guide.failedN', { n: failed.map(function (link) { return link.n; }).join(', ') });
        return linkText(links[0]);
    };
    return guide;
})();
