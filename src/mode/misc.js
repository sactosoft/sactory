const { TextExprMode } = require("./textexpr");

class SimpleTextMode extends TextExprMode {
	
	constructor(transpiler, parser, result, attributes) {
		super(transpiler, parser, result, attributes);
		this.matches = ["<", "%", "@"];
	}

}

class ScriptMode extends SimpleTextMode {

	static get name() {
		return "script";
	}

	static matchesTag(tagName) {
		return tagName === "script";
	}

	static getOptions() {
		return {};
	}

	handle() {
		return this.parser.input.substr(this.parser.index, 8) === "/script>";
	}

}

class StyleMode extends SimpleTextMode {

	static get name() {
		return "style";
	}

	static matchesTag(tagName) {
		return tagName === "style";
	}

	static getOptions() {
		return {};
	}

	handle() {
		return this.parser.input.substr(this.parser.index, 7) === "/style>";
	}

}

class CommentMode extends SimpleTextMode {

	constructor(transpiler, parser, result, attributes) {
		super(transpiler, parser, result, attributes);
		this.matches = ["<", "$"];
	}

	static get name() {
		return "_comment";
	}

	static getOptions() {
		return {};
	}

	handle() {
		return false;
	}

}

module.exports = { ScriptMode, StyleMode, CommentMode };
