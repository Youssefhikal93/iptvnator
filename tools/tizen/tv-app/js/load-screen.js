// Shared source/catalogue failures. Lists keep their selection underneath
// this screen; completing the same load restores that selection.
window.LoadScreen = (function () {
    'use strict';

    var KEY = Keys;
    var jobs = {};
    var paused = false;
    var shown = null;
    var priorFocus = null;
    var root = document.getElementById('load-error');
    var button = document.getElementById('load-retry');
    var sourcesButton = document.getElementById('load-sources');
    var openSources = null;

    function message(err) {
        if (err.code === 'saved') return [I18n.t('load.savedTitle'), I18n.t('load.savedHint')];
        if (err.code === 'account') return SourceAccount.screen(err);
        if (err.code === 'busy') return [I18n.t('load.busyTitle'), I18n.t('load.busyHint')];
        if (navigator.onLine === false || err.name === 'TypeError' || /network|failed to fetch|load failed/i.test(err.message)) {
            return [I18n.t('load.networkTitle'), I18n.t('load.networkHint')];
        }
        if (err.code === 'timeout' || /timeout|timed out|HTTP 5\d\d/i.test(err.message)) {
            return [I18n.t('load.slowTitle'), I18n.t('load.slowHint')];
        }
        return [I18n.t('empty.failed.title'), I18n.t('load.genericHint')];
    }

    function render() {
        var failed = Object.keys(jobs).filter(function (key) {
            var job = jobs[key];
            var active = job.active();
            if (!active) job.dismissed = false;
            return job.status.error && active && !job.dismissed;
        });
        var job = failed.length ? jobs[failed[0]] : null;
        if (job && !shown) priorFocus = document.activeElement;
        root.classList.toggle('hidden', !job);
        shown = job;
        if (!job) {
            if (priorFocus && !paused) priorFocus.focus();
            priorFocus = null;
            return;
        }
        var lines = message(job.status.error);
        document.getElementById('load-message').textContent = lines[0];
        document.getElementById('load-hint').textContent = lines[1];
        document.getElementById('load-countdown').textContent = job.status.running ? I18n.t('load.tryingAgain') :
            job.status.seconds !== null ? I18n.t('load.retryingIn', { s: job.status.seconds }) : '';
        button.setAttribute('aria-disabled', job.status.running ? 'true' : 'false');
        // An account problem is fixed in Sources, so offer the way there.
        sourcesButton.classList.toggle('hidden', job.status.error.code !== 'account' || !openSources);
        if (!paused && document.activeElement !== sourcesButton) button.focus();
    }

    function run(key, load, active) {
        if (jobs[key]) {
            jobs[key].active = active;
            jobs[key].dismissed = false;
            render();
            return jobs[key].retry.promise;
        }
        var job = { active: active, status: {} };
        jobs[key] = job;
        job.retry = Retry({ load: load, changed: function (status) {
            job.status = status;
            render();
        } });
        var promise = job.retry.promise.then(function (loaded) {
            if (jobs[key] === job) delete jobs[key];
            render();
            return loaded;
        });
        job.retry.now();
        if (paused) job.retry.pause();
        return promise;
    }

    button.onclick = function () { if (shown) shown.retry.now(); };
    sourcesButton.onclick = function () { if (shown && openSources) openSources(); };

    return {
        run: run,
        render: render,
        enter: function () {
            Object.keys(jobs).forEach(function (key) { jobs[key].dismissed = false; });
            render();
        },
        reset: function () {
            Object.keys(jobs).forEach(function (key) { jobs[key].retry.cancel(); });
            jobs = {};
            render();
        },
        pause: function (pause) {
            paused = pause;
            Object.keys(jobs).forEach(function (key) { jobs[key].retry[pause ? 'pause' : 'resume'](); });
            render();
        },
        onSources: function (open) { openSources = open; },
        key: function (code) {
            if (!shown) return false;
            var offered = !sourcesButton.classList.contains('hidden');
            var onSources = document.activeElement === sourcesButton;
            if (offered && code === KEY.RIGHT) sourcesButton.focus();
            else if (offered && code === KEY.LEFT && onSources) button.focus();
            else if (code === KEY.ENTER) onSources ? sourcesButton.onclick() : shown.retry.now();
            else if (Keys.isBack(code) || code === KEY.LEFT) {
                if (shown.status.error.code === 'saved') return code === KEY.LEFT ? true : 'exit';
                shown.dismissed = true;
                render();
                return false;
            }
            return true;
        },
    };
})();
