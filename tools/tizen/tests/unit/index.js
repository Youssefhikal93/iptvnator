'use strict';

// Keep the dependency-free directory command working on Node's file-based runner.
var fs = require('node:fs');
var path = require('node:path');
fs.readdirSync(__dirname).filter(function (filename) {
    return /\.test\.js$/.test(filename);
}).forEach(function (filename) {
    require(path.join(__dirname, filename));
});
