'use strict';

var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

module.exports = function (files, stored, overrides) {
    var records = Object.assign({}, stored);
    var listeners = {};
    var sandbox = Object.assign({
        localStorage: {
            getItem: function (key) { return records[key] === undefined ? null : records[key]; },
            setItem: function (key, value) { records[key] = String(value); },
        },
        document: { addEventListener: function (name, callback) { listeners[name] = callback; } },
        Date: Date,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        setInterval: setInterval,
        clearInterval: clearInterval,
    }, overrides);
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    // Every module may ask I18n for its English text.
    ['i18n.js', 'i18n/en.js'].concat(files).forEach(function (file) {
        var filename = path.join(__dirname, '../../tv-app/js', file);
        vm.runInContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename: filename });
    });
    return { globals: sandbox, stored: records, events: listeners };
};
