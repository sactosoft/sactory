const Result = require("../result");

/**
 * @since 0.15.0
 */
class Mode {

	constructor(transpiler, parser, result, attributes) {
		this.transpiler = transpiler;
		this.parser = parser;
		this.result = result;
		this.attributes = attributes;
	}

	/**
	 * @since 0.144.0
	 */
	usedAttributes() {
		return [];
	}

	/**
	 * @since 0.150.0
	 */
	addSource(position, value) {
		return this.result.push(Result.SOURCE, position, {value});
	}

	/**
	 * @since 0.150.0
	 */
	addText(position, value) {
		return this.result.push(Result.TEXT, position, {value});
	}

	/**
	 * @since 0.69.0
	 */
	parseCode(position, fun, ...args) {
		this.parser.parseTemplateLiteral = null;
		const expr = this.parser[fun](...args);
		this.transpiler.updateTemplateLiteralParser();
		return this.transpiler.parseCode(position, expr);
	}

	start() {}

	end() {}

	chainAfter() {}

	parse(/*handle, eof*/) {}

}

module.exports = { Mode };
