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
	require("./src/runtime/core"),
	require("./src/runtime/cssb"),
	require("./src/runtime/bind"),
	require("./src/runtime/observable"),
	require("./src/transpiler"),
	require("./src/watcher")
);
