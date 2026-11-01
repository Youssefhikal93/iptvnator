'use strict';

// Tizen web service (#91, id IPTVnTVApp.HubPreview): hands the tiles the app
// built (app-control data "preview") to the Samsung home screen, then exits,
// as Samsung requires. Logs nothing about what the tiles show.
function quit() {
    try {
        tizen.application.getCurrentApplication().exit();
    } catch (e) {
        // The TV ends a service that does not exit after five minutes.
    }
}

function previewText() {
    var request = tizen.application.getCurrentApplication().getRequestedAppControl();
    var data = (request && request.appControl && request.appControl.data) || [];
    for (var i = 0; i < data.length; i++) {
        if (data[i].key === 'preview') return data[i].value[0];
    }
    return null;
}

module.exports.onStart = function () {};

module.exports.onRequest = function () {
    try {
        var text = previewText();
        if (!text) return quit();
        webapis.preview.setPreviewData(text, quit, function (e) {
            console.log('setPreviewData failed: ' + (e && e.message));
            quit();
        });
    } catch (e) {
        console.log('setPreviewData threw: ' + e.message);
        quit();
    }
};

module.exports.onExit = function () {};
