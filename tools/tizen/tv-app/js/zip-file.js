// Reads the files of a small zip (SubDL serves subtitles zipped, #52)
// without a library: the central directory names each file, and stored or
// deflated data is unpacked with the browser's DecompressionStream.
window.ZipFile = (function () {
    'use strict';

    var MAX_FILES = 50;
    var MAX_SIZE = 2000000; // Bytes per unpacked file; a subtitle is far smaller.

    function failure() {
        var error = new Error('Invalid zip file');
        error.code = 'connection';
        error.status = 0;
        return error;
    }

    function inflate(bytes) {
        var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Response(stream).arrayBuffer().then(function (buffer) { return new Uint8Array(buffer); });
    }

    // [{ name, size, read() -> Promise<Uint8Array> }] for every file in the zip.
    function entries(buffer) {
        var bytes = new Uint8Array(buffer);
        var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        var end = -1;
        // The end record sits in the last 22 bytes plus an optional comment.
        for (var at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
            if (view.getUint32(at, true) === 0x06054b50) {
                end = at;
                break;
            }
        }
        if (end < 0) throw failure();
        var count = view.getUint16(end + 10, true);
        var cursor = view.getUint32(end + 16, true);
        var list = [];
        for (var i = 0; i < Math.min(count, MAX_FILES); i++) {
            if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) throw failure();
            var method = view.getUint16(cursor + 10, true);
            var packed = view.getUint32(cursor + 20, true);
            var size = view.getUint32(cursor + 24, true);
            var nameLength = view.getUint16(cursor + 28, true);
            var local = view.getUint32(cursor + 42, true);
            var name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
            cursor += 46 + nameLength + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
            if (/\/$/.test(name)) continue;
            list.push({ name: name, size: size, read: reader(bytes, view, local, method, packed, size) });
        }
        return list;
    }

    function reader(bytes, view, local, method, packed, size) {
        return function () {
            if (size > MAX_SIZE || local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) return Promise.reject(failure());
            var start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
            var data = bytes.subarray(start, start + packed);
            if (method === 0) return Promise.resolve(data);
            if (method === 8) return inflate(data).catch(function () { throw failure(); });
            return Promise.reject(failure());
        };
    }

    return { entries: function (buffer) {
        try {
            return entries(buffer);
        } catch (error) {
            throw error && error.code ? error : failure();
        }
    } };
})();
