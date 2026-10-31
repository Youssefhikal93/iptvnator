'use strict';

var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

// Stores are tested with plain "iptvnator-tv:<name>" keys through this stand-in;
// profile-store.test.js loads the real profile-store.js instead.
var PLAIN_PROFILES = {
    key: function (name) { return 'iptvnator-tv:' + name; },
    sharedKey: 'iptvnator-tv:shared-settings',
    onSwitch: function () {},
};

module.exports = function (files, stored, overrides) {
    var records = Object.assign({}, stored);
    var listeners = {};
    var sandbox = Object.assign({
        localStorage: {
            getItem: function (key) { return records[key] === undefined ? null : records[key]; },
            setItem: function (key, value) { records[key] = String(value); },
            removeItem: function (key) { delete records[key]; },
            key: function (index) { return Object.keys(records)[index] || null; },
            get length() { return Object.keys(records).length; },
        },
        document: { addEventListener: function (name, callback) { listeners[name] = callback; } },
        Date: Date,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        setInterval: setInterval,
        clearInterval: clearInterval,
    }, overrides);
    if (files.indexOf('profile-store.js') === -1 && !sandbox.ProfileStore) sandbox.ProfileStore = PLAIN_PROFILES;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    // Every module may ask I18n for its English text; guide code reads a source's links (#90).
    ['i18n.js', 'i18n/en.js', 'stored.js', 'guide-links.js'].concat(files.filter(function (file) { return file !== 'guide-links.js'; })).forEach(function (file) {
        var filename = path.join(__dirname, '../../tv-app/js', file);
        vm.runInContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename: filename });
    });
    return { globals: sandbox, stored: records, events: listeners };
};
