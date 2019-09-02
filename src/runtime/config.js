var Sactory = {};

var mac = typeof window == "object" && window.navigator.platform.indexOf("Mac") != -1;
var ie = typeof window == "object" && (window.navigator.platform.indexOf("MSIE ") != -1 || window.navigator.userAgent.indexOf("Trident/") != -1);

var cmd = mac ? "meta" : "ctrl";

/**
 * @since 0.64.0
 */
Sactory.config = {
	mac, ie,
	prefix: "sa",
	shortcut: {
		cmd: cmd,
		save: "keydown:" + cmd + ":key-code.83",	// s
		copy: "keydown:" + cmd + ":key-code.67",	// c
		cut: "keydown:" + cmd + ":key-code.88",		// x
		paste: "keydown:" + cmd + ":key-code.86",	// v
		print: "keydown:" + cmd + ":key-code.80",	// p
		undo: "keydown:" + cmd + ":key-code.90",	// z
		redo: "keydown:" + cmd + ":key-code.89",	// y
		find: "keydown:" + cmd + ":key-code.70",	// f
		select: "keydown:" + cmd + ":key-code.65",	// a
	},
	event: {
		aliases: {
			"space": " ",
			"ctrl": "control",
			"column": ":",
			"dot": ".",
			"esc": "escape"
		}
	}
};

module.exports = Sactory;
