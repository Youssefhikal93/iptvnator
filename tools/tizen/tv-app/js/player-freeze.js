// Keeps the last picture of a live stream on screen while it reconnects:
// closing the stream blanks the <video>, so its frame is copied to a canvas.
window.PlayerFreeze = function (video, canvas) {
    'use strict';

    return {
        capture: function () {
            try {
                if (!video.videoWidth || !video.videoHeight) return;
                var scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
                var w = video.videoWidth * scale;
                var h = video.videoHeight * scale;
                var context = canvas.getContext('2d');
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
                canvas.classList.remove('hidden');
            } catch (e) {
                // No frame to keep; the status overlay still covers the gap.
            }
        },
        clear: function () {
            canvas.classList.add('hidden');
        },
    };
};
