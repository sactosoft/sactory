const Result = require("../result");
const Parser = require("../parser");

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
		this.result.push(Result.SOURCE, position, {value});
	}

	/**
	 * @since 0.150.0
	 */
	addText(position, value) {
		this.result.push(Result.TEXT, position, {value});
	}

	/**
	 * @since 0.69.0
	 */
	parseCode(fun, trackable) {
		this.parser.parseTemplateLiteral = null;
		var expr = Parser.prototype[fun].apply(this.parser, Array.prototype.slice.call(arguments, 2));
		this.transpiler.updateTemplateLiteralParser();
		return this.transpiler.parseCode(expr, this.parser, trackable);
	}

	parseCodeToSource(fun, trackable) {
		var expr = Parser.prototype[fun].apply(this.parser, Array.prototype.slice.call(arguments, 2));
		return this.transpiler.parseCode(expr, this.parser, trackable).source;
	}

	parseCodeToValue(/*fun*/) {
		return this.parseCode.apply(this, arguments).toValue();
	}

	start() {}

	end() {}

	chainAfter() {}

	parse(/*handle, eof*/) {}

}

module.exports = { Mode };
