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
	require("./src/runtime/server"),
	require("./src/runtime/config"),
	require("./src/runtime/animation"),
	require("./src/runtime/bind"),
	require("./src/runtime/core"),
	require("./src/runtime/observable"),
	require("./src/runtime/style"),
	require("./src/transpiler"),
	require("./src/watcher")
);
