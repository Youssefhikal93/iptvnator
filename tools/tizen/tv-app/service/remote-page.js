'use strict';
var fs = require('fs');
var crypto = require('crypto');
// Browsers hash inline scripts after turning CRLF into LF, and a Windows
// checkout packages CRLF files: hash and serve the same LF text.
function read(name) { return fs.readFileSync(__dirname + '/' + name, 'utf8').replace(/\r\n?/g, '\n'); }
var css = read('remote-page.css');
var markup = read('remote-page.html');
var client = read('remote-page-client.js');
function escape(text) {
    return String(text || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
function script(text) {
    return JSON.stringify(text).replace(/[<>&\u2028\u2029]/g, function (c) { return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4); });
}
function build(state) {
    var words = state.words || {};
    var accent = ['blue', 'saffron', 'asphalt', 'violet', 'pink'].indexOf(state.accent) >= 0 ? state.accent : 'blue';
    var html = markup.replace(/(data-t="([a-zA-Z]+)"[^>]*>)[^<]*/g, function (all, attr, id) { return attr + escape(words[id]); });
    return '<!doctype html><html data-accent="' + accent + '" lang="' + escape(state.lang || 'en') + '" dir="' + (state.dir === 'rtl' ? 'rtl' : 'ltr') + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="referrer" content="no-referrer"><meta name="apple-mobile-web-app-capable" content="yes"><title>' + escape(words.title) + '</title><style>' + css + '</style></head><body>' + html + '<script type="application/json" id="remote-words">' + script({ words: words }) + '</script><script>' + 'window.REMOTE=JSON.parse(document.getElementById("remote-words").textContent);\n' + client + '</script></body></html>';
}
var executable = 'window.REMOTE=JSON.parse(document.getElementById("remote-words").textContent);\n' + client;
var hash = crypto.createHash('sha256').update(executable).digest('base64');
module.exports = { build: build, csp: "default-src 'none'; script-src 'sha256-" + hash + "'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" };
