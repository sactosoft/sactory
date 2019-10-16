const { OptionalLogicMode } = require("./logic");
const { AutoSourceCodeMode } = require("./sourcecode");
const entities = require("../json/entities.json");

/**
 * @since 0.15.0
 */
class HTMLMode extends OptionalLogicMode {

	constructor(transpiler, parser, result, attributes) {
		super(transpiler, parser, result, attributes);
	}

	static get name() {
		return "html";
	}

	static getOptions() {
		return {};
	}

}

if(typeof entities === "object") {
	HTMLMode.prototype.replaceText = function(data){
		return data.replace(/&(#(x)?)?([a-zA-Z0-9]+);/gm, (_, hash, hex, value) =>
			String.fromCharCode(hash ? (hex ? parseInt(value, 16) : value) : entities[value]));
	};
} else {
	let converter;
	HTMLMode.prototype.replaceText = function(data){
		if(!converter) converter = document.createElement("textarea");
		converter.innerHTML = data;
		return converter.value;
	};
}

/**
 * @since 0.108.0
 */
class AutoHTMLMode extends HTMLMode {

	constructor(transpiler, parser, result, attributes, parent) {
		super(transpiler, parser, result, parent && parent.attributes || attributes);
	}

	static get name() {
		return "auto-html";
	}

	static getOptions() {
		return HTMLMode.getOptions();
	}

	static matchesTag(tagName, mode) {
		return mode instanceof AutoSourceCodeMode;
	}

}

module.exports = { HTMLMode, AutoHTMLMode };
