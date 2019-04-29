var version = require("./package.json").version;
var splitted = version.split('.');

function get(i) {
	return parseInt(splitted[i]);
}

module.exports = {
	version: version,
	major: get(0),
	minor: get(1),
	patch: get(2)
};
