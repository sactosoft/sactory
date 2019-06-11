var Sactory = {};

var mac = typeof window == "object" && window.navigator.platform.indexOf("Mac") != -1;

var cmd = mac ? "meta" : "ctrl";

/**
 * @since 0.64.0
 */
Sactory.config = {
	prefix: "sa",
	shortcut: {
		cmd: cmd,
		save: "keydown:" + cmd + ":key.s",
		copy: "keydown:" + cmd + ":key.c",
		cut: "keydown:" + cmd + ":key.x",
		paste: "keydown:" + cmd + ":key.v",
		print: "keydown:" + cmd + ":key.p",
		undo: "keydown:" + cmd + ":key.z",
		redo: "keydown:" + cmd + ":key.y",
		find: "keydown:" + cmd + ":key.f",
		select: "keydown:" + cmd + ":key.a"
	},
	event: {
		aliases: {
			"space": " ",
			"ctrl": "control"
		}
	}
};

Sactory.newPrefix = function(){
	return Sactory.config.prefix + Math.floor(Math.random() * 100000);
}

module.exports = Sactory;
