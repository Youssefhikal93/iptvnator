// Bounded XMLTV scanner: only one tag and the selected text fields survive a chunk.
window.XmltvParser = (function () {
    'use strict';

    function decode(text) {
        return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (entity, code) {
            var named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
            if (code.charAt(0) !== '#') return named[code.toLowerCase()];
            var n = code.charAt(1).toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
            return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '\ufffd';
        });
    }

    function time(text, offset) {
        var m = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?\s*(?:([+-])(\d\d)(\d\d)|Z)?$/.exec(text || '');
        if (!m) return NaN;
        var zone = m[7] ? (Number(m[8]) * 60 + Number(m[9])) * (m[7] === '+' ? 1 : -1) : 0;
        return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - zone * 60000 + offset * 3600000;
    }

    function attrs(tag) {
        var values = Object.create(null);
        tag.replace(/([\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g, function (_, name, quote, value) {
            values[name] = decode(value);
            return '';
        });
        return values;
    }

    function create(options) {
        var buffer = '';
        var stack = [];
        var root = false;
        var finished = false;
        var literal = null;
        var record = null;
        var field = null;
        var text = '';
        var now = options.now;

        function append(value) {
            if (field) text = (text + value).slice(0, 65536);
            else if (!stack.length && value.trim()) throw new Error('Text outside XMLTV');
        }

        function close(name) {
            if (stack.pop() !== name) throw new Error('Unclosed XMLTV tag');
            if (field === name) {
                if (record && name === 'display-name') record.names.push(decode(text).trim());
                else if (record && !record[name]) record[name] = decode(text).trim();
                field = null;
                text = '';
            }
            if (name === 'channel' || name === 'programme') {
                if (record && name === 'channel' && record.id) options.emit('channel', record);
                if (record && name === 'programme' && record.channel && record.title && record.end > record.start && record.end > now - 10800000 && record.start < now + 172800000) options.emit('programme', record);
                record = null;
            }
            if (name === 'tv') finished = true;
        }

        function tag(value) {
            if (/^<\?/.test(value) || /^<!DOCTYPE\s/i.test(value)) return;
            var m = /^<(\/?)([\w:-]+)(?:\s[^<>]*)?\s*\/?\s*>$/.exec(value);
            if (!m) throw new Error('Invalid XMLTV tag');
            var name = m[2];
            if (m[1]) return close(name);
            if (!stack.length) {
                if (name !== 'tv' || root) throw new Error('Not XMLTV');
                root = true;
            }
            stack.push(name);
            var a = attrs(value);
            if (name === 'channel') record = { id: a.id, names: [] };
            if (name === 'programme') record = { channel: a.channel, start: time(a.start, options.offset), end: time(a.stop, options.offset), title: '', desc: '' };
            if (record && /^(display-name|title|desc)$/.test(name)) { field = name; text = ''; }
            if (/\/\s*>$/.test(value)) close(name);
        }

        // Walks the buffer with a cursor and cuts it once per chunk: slicing
        // after every tag made each chunk quadratic on large guide files.
        function scan() {
            var p = 0;
            var n = buffer.length;
            while (p < n) {
                if (literal) {
                    var end = buffer.indexOf(literal, p);
                    var take = end < 0 ? Math.max(p, n - 2) : end;
                    if (literal === ']]>') append(buffer.slice(p, take).replace(/&/g, '&amp;'));
                    p = take + (end < 0 ? 0 : 3);
                    if (end < 0) break;
                    literal = null;
                    continue;
                }
                if (buffer.charAt(p) !== '<') {
                    var at = buffer.indexOf('<', p);
                    if (at < 0) { append(buffer.slice(p)); p = n; break; }
                    append(buffer.slice(p, at));
                    p = at;
                }
                if (buffer.startsWith('<!--', p) || buffer.startsWith('<![CDATA[', p)) {
                    literal = buffer.startsWith('<!--', p) ? '-->' : ']]>';
                    p += literal === '-->' ? 4 : 9;
                    continue;
                }
                var quote = 0;
                var i;
                for (i = p + 1; i < n; i++) {
                    var c = buffer.charCodeAt(i);
                    if (quote) { if (c === quote) quote = 0; }
                    else if (c === 34 || c === 39) quote = c;
                    else if (c === 62) break;
                }
                if (i === n) break;
                tag(buffer.slice(p, i + 1));
                p = i + 1;
            }
            buffer = p ? buffer.slice(p) : buffer;
            if (buffer.length > 131072) throw new Error('XMLTV tag too large');
        }

        return {
            write: function (chunk) { buffer += chunk; scan(); },
            end: function () {
                if (buffer.trim() || literal || stack.length || !root || !finished) throw new Error('Incomplete XMLTV');
            },
        };
    }

    // Sniff across even a one-byte first chunk. HTTP Content-Encoding is
    // already decoded by fetch; a .gz URL alone must not decompress it twice.
    function textStream(body) {
        var reader = body.getReader();
        var first = [];
        var length = 0;
        function sniff() {
            return reader.read().then(function (part) {
                if (!part.done) { first.push(part.value); length += part.value.length; }
                if (!part.done && length < 2) return sniff();
                var head = new Uint8Array(length);
                var at = 0;
                first.forEach(function (bytes) { head.set(bytes, at); at += bytes.length; });
                var bytes = new ReadableStream({
                    start: function (controller) { if (length) controller.enqueue(head); },
                    pull: function (controller) {
                        return reader.read().then(function (next) {
                            if (next.done) controller.close();
                            else controller.enqueue(next.value);
                        });
                    },
                    cancel: function (reason) { return reader.cancel(reason); },
                });
                var gzip = head[0] === 0x1f && head[1] === 0x8b;
                if (gzip) bytes = bytes.pipeThrough(new DecompressionStream('gzip'));
                return bytes.pipeThrough(new TextDecoderStream());
            });
        }
        return sniff();
    }

    // Quality, codec and copy words a provider adds to a name (#90).
    var EXTRA = /^(?:uhd|fhd|hd|sd|hevc|h26[45]|x26[45]|low|backup|\d{3,4}p|\d{2}fps)$/;

    // The words that name a channel, as providers and guides write them
    // differently (#90): "Backup: Bein SP 7 H265 Low" and "beIN SPORTS 7.qa"
    // are both bein sports 7. Words that tell channels apart stay: MAX 1 is
    // not 1, and 4K stays when it is the name ("beIN 4K") rather than the
    // quality after a channel number ("beIN SPORTS 1 4K").
    function words(name) {
        var text = String(name || '').toLowerCase()
            .replace(/\.[a-z]{2}(?:@[\w-]+)?$/, '')
            .replace(/^[^:|]{1,30}[:|](?=.*[\p{L}\p{N}])/u, '')
            .replace(/h\.26([45])/g, 'h26$1');
        var list = text.split(/[^\p{L}\p{N}]+/u).filter(function (word) { return word && !EXTRA.test(word); });
        list = list.map(function (word) { return word === 'sp' ? 'sports' : word; });
        var numbered = list.some(function (word) { return /^\d+$/.test(word); });
        return list.filter(function (word) { return !(numbered && /^[48]k$/.test(word)); });
    }

    function normalName(name) {
        return words(name).join('');
    }

    function match(channel, index) {
        var id = String(channel.epg_channel_id || channel.tvg_id || '').toLowerCase();
        if (Object.prototype.hasOwnProperty.call(index.ids, id)) return index.ids[id];
        var name = normalName(channel.name);
        return Object.prototype.hasOwnProperty.call(index.names, name) ? index.names[name] : null;
    }

    // A guide saved with an older name index is downloaded again (xmltv.js).
    var NAME_RULES = 2;

    return { create: create, time: time, textStream: textStream, words: words, normalName: normalName, match: match, NAME_RULES: NAME_RULES };
})();
