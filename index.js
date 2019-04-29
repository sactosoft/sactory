function merge() {
	var base = {};
	for(var i=0; i<arguments.length; i++) {
		var o = arguments[i];
		for(var key in o) {
			base[key] = o[key];
		}
	}
	return base;
}

module.exports = merge(
	require("./src/util"),
	require("./src/runtime/server"),
	require("./src/runtime/common"),
	require("./src/transpiler"),
	require("./src/watcher")
);
