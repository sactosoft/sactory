const Result = require("../result");
const { Mode } = require("./mode");

const INTERPOLATED = {
	"$": ["text", Result.INTERPOLATED_TEXT],
	"#": ["html", Result.INTERPOLATED_HTML],
	"%": ["value", Result.INTERPOLATED_VALUE],
	"@": ["string", Result.INTERPOLATED_STRING],
	"*": ["custom1", Result.INTERPOLATED_CUSTOM_1],
	"^": ["custom2", Result.INTERPOLATED_CUSTOM_2],
	"~": ["custom3", Result.INTERPOLATED_CUSTOM_3]
};

/**
 * Basic parser that recognises text, expressions and new tags.
 * @since 0.28.0
 */
class TextExprMode extends Mode {

	constructor(transpiler, parser, result, attributes) {
		super(transpiler, parser, result, attributes);
		this.current = "";
		this.matches = ["<"];
		for(let symbol in INTERPOLATED) {
			if(transpiler.options.interpolation[INTERPOLATED[symbol][0]]) {
				this.matches.push(symbol);
			}
		}
	}

	/**
	 * Parses and adds the current text to the result and resets it.
	 */
	addCurrent() {
		if(this.current.length) {
			this.addText(null, this.replaceText(this.current));
			this.current = "";
		}
	}

	/**
	 * Adds text to the current data and not yet to the result.
	 * The text not added directly to the result can later be joined
	 * together and manipulated.
	 */
	pushText(value) {
		this.current += value;
	}

	/**
	 * Removes whitespaces from the end of the current data.
	 * @returns The trimmed text.
	 */
	trimEnd() {
		const trimmed = this.current.trimEnd();
		if(trimmed.length) {
			const ret = this.current.substr(trimmed.length);
			this.current = trimmed;
			return ret;
		} else {
			return "";
		}
	}

	/**
	 * Replaces or formats the text before it is added from the current
	 * data to the result.
	 */
	replaceText(text) {
		return text;
	}

	handle() {
		return true;
	}

	parseImpl(pre, match, handle, eof) {
		if(!match) {
			eof();
		} else if(match === "<") {
			if(this.handle()) {
				this.addCurrent();
				handle();
			} else {
				this.pushText("<");
			}
		} else if(this.parser.peek() == "{") {
			if(pre.slice(-1) == "\\") {
				// remove backslash from text and replace it with the match
				this.current = this.current.slice(0, -1) + match;
			} else {
				this.addCurrent();
				const position = this.parser.position;
				const expr = this.parseCode("skipEnclosedContent", true, true);
				this.result.push(INTERPOLATED[match][1], position, {expr});
			}
		} else {
			this.pushText(match);
		}
	}

	parse(handle, eof) {
		const { pre, match } = this.parser.find(this.matches, false, true);
		this.pushText(pre);
		this.parseImpl(pre, match, handle, eof);
	}

}

module.exports = { TextExprMode };
