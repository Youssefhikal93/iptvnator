'use strict';

// The page the phone opens (#85): one self-contained form, no outside
// scripts, fonts or images. The TV supplies the words in its own language.
var LABELS = ['title', 'name', 'url', 'user', 'pass', 'send', 'sent', 'failed', 'expired'];

function escape(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

// Only known keys, only short strings: the TV's words, never markup.
function labels(input) {
    var out = {};
    LABELS.forEach(function (key) {
        var value = input && typeof input[key] === 'string' ? input[key] : '';
        out[key] = value.length > 0 && value.length <= 120 ? value : key;
    });
    return out;
}

function field(id, label, type, placeholder, required) {
    return '<label for="' + id + '">' + escape(label) + '</label><input id="' + id + '" type="' + type + '" autocomplete="off" autocapitalize="off" spellcheck="false"' +
        (placeholder ? ' placeholder="' + escape(placeholder) + '"' : '') + (required ? ' required' : '') + '>';
}

function build(kind, words, dir) {
    var l = labels(words);
    var xtream = kind === 'xtream';
    var rows = field('name', l.name, 'text', '', false) +
        field('url', l.url, 'url', xtream ? 'http://example.com:8080' : 'https://example.com/playlist.m3u', true) +
        (xtream ? field('user', l.user, 'text', '', true) + field('pass', l.pass, 'password', '', true) : '');
    var script = '(function(){var f=document.getElementById("f"),m=document.getElementById("m"),b=document.getElementById("b");' +
        'var T=' + JSON.stringify({ sent: l.sent, failed: l.failed, expired: l.expired }).replace(/</g, '\\u003c') + ';' +
        'function v(id){var e=document.getElementById(id);return e?e.value:"";}' +
        'f.addEventListener("submit",function(e){e.preventDefault();b.disabled=true;m.textContent="";' +
        'var x=new XMLHttpRequest();x.open("POST",location.pathname);x.setRequestHeader("Content-Type","text/plain");' +
        'x.onload=function(){if(x.status===200){f.style.display="none";m.textContent=T.sent;}' +
        'else{b.disabled=false;m.textContent=x.status===404?T.expired:T.failed;}};' +
        'x.onerror=function(){b.disabled=false;m.textContent=T.failed;};' +
        'x.send(JSON.stringify({name:v("name"),url:v("url"),user:v("user"),pass:v("pass")}));});})();';
    return '<!doctype html><html lang="en" dir="' + (dir === 'rtl' ? 'rtl' : 'ltr') + '"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer">' +
        '<title>Jo-TV</title><style>' +
        'body{font:18px/1.4 system-ui,sans-serif;margin:0;padding:24px;background:#14161a;color:#f2f2f2}' +
        'main{max-width:480px;margin:0 auto}h1{font-size:26px}label{display:block;margin-top:18px;color:#aab}' +
        'input{box-sizing:border-box;width:100%;margin-top:6px;padding:14px;font:inherit;color:inherit;background:#23262d;border:2px solid #3a3f4a;border-radius:12px}' +
        'input:focus{outline:none;border-color:#7aa7ff}button{width:100%;margin-top:26px;padding:14px;font:inherit;font-weight:600;color:#fff;background:#3b6fe0;border:0;border-radius:12px}' +
        'button:disabled{opacity:.5}#m{margin-top:18px}</style></head><body><main><h1>' + escape(l.title) + '</h1>' +
        '<form id="f" autocomplete="off">' + rows + '<button id="b" type="submit">' + escape(l.send) + '</button></form><p id="m"></p></main>' +
        '<script>' + script + '</script></body></html>';
}

module.exports = { build: build, labels: labels, escape: escape, LABELS: LABELS };
