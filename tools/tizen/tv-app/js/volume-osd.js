// Volume set through tvaudiocontrol shows no TV banner, so draw our own.
window.VolumeOsd = (function () {
    'use strict';
    var box = null;
    var timer = null;
    function build() {
        box = document.createElement('div');
        box.id = 'volume-osd';
        box.setAttribute('aria-hidden', 'true');
        box.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path class="wave" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/><path class="cross" d="M16 9l5 6M21 9l-5 6"/></svg><div class="track"><div class="fill"></div></div><b></b>';
        document.body.appendChild(box);
    }
    function show(level, muted) {
        if (!box) build();
        level = Math.max(0, Math.min(100, Math.round(level)));
        box.classList.toggle('muted', !!muted);
        box.querySelector('.fill').style.width = (muted ? 0 : level) + '%';
        box.querySelector('b').textContent = String(level);
        box.classList.add('on');
        clearTimeout(timer);
        timer = setTimeout(function () { box.classList.remove('on'); }, 2000);
    }
    return { show: show };
})();
