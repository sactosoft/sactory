function merge(core, ...args) {
	args.forEach(arg => {
		for(var key in arg) {
			core[key] = arg[key];
		}
	});
	return core;
}

require("./src/dom"); // init globals

module.exports = merge(
	require("./src/runtime/core"),
	require("./src/runtime/server"),
	require("./src/runtime/config"),
	require("./src/runtime/animation"),
	require("./src/runtime/bind"),
	require("./src/runtime/observable"),
	require("./src/runtime/style")
);
