var { version } = require("./package.json");
var [ major, minor, patch ] = version.split(".").map(v => parseInt(v));

module.exports = { version, major, minor, patch };
