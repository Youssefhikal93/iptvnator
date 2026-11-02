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
    return '<!doctype html><html data-accent="' + accent + '" lang="' + escape(state.lang || 'en') + '" dir="' + (state.dir === 'rtl' ? 'rtl' : 'ltr') + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="referrer" content="no-referrer"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="theme-color" content="#0b0f17"><link rel="icon" href="/icon-180.png"><link rel="apple-touch-icon" href="/icon-180.png"><link rel="manifest" href="/manifest.webmanifest"><title>' + escape(words.title) + '</title><style>' + css + '</style></head><body>' + html + '<script type="application/json" id="remote-words">' + script({ words: words }) + '</script><script>' + 'window.REMOTE=JSON.parse(document.getElementById("remote-words").textContent);\n' + client + '</script></body></html>';
}
var executable = 'window.REMOTE=JSON.parse(document.getElementById("remote-words").textContent);\n' + client;
var hash = crypto.createHash('sha256').update(executable).digest('base64');
// The home-screen icon and its install manifest.
var icons = { '/icon-180.png': fs.readFileSync(__dirname + '/remote-icon-180.png'), '/icon-512.png': fs.readFileSync(__dirname + '/remote-icon-512.png') };
function manifest(state) {
    var name = (state.words && state.words.title) || 'Jotv remote';
    return JSON.stringify({ name: name, short_name: name, start_url: '/', display: 'standalone', background_color: '#0b0f17', theme_color: '#0b0f17',
        icons: [{ src: '/icon-180.png', sizes: '180x180', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] });
}
module.exports = { build: build, icons: icons, manifest: manifest, csp: "default-src 'none'; script-src 'sha256-" + hash + "'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" };
