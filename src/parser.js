class ParserError extends Error {

	constructor(message, fileName, lineNumber) {
		super(message, fileName, lineNumber);
	}

}

class ParserRegExp {

	constructor({observables: o, tags: {types: t}, attributes: {types: a}}) {
		// init observables
		this.singleExpressionPrefix = new RegExp(`^([-+~!]*((new|delete|typeof|await)\\s+)?${o.supported ? `(${o.computed ? "&|" : ""}[*${o.peek ? "^" : ""}]${o.maybe ? "\\??" : ""})?` : ""})`);
		// init tag name
		let tags = [];
		if(t.directive) tags.push(":");
		if(t.children) tags.push("$");
		if(t.slot) tags.push("@");
		if(t.special) tags.push("#");
		this.tagName = new RegExp(`^${tags.length ? `[${tags.join("")}]?` : ""}[a-zA-Z][a-zA-Z0-9$:.-]*`);
		// init attribute prefix
		let prefix = {symbol: [], text: ["attr"]};
		[
			["directive", ":", "dir"],
			["prop", "@", "prop"],
			["style", "&", "style"],
			["event", "+", "on"],
			["widget", "$"],
			["updateWidget", "~"],
			["bind", "*", "bind"],
		].forEach(([type, symbol, text]) => {
			if(a[type]) {
				prefix.symbol.push(symbol);
				if(text) prefix.text.push(text);
			}
		});
		this.attributePrefix = new RegExp(`^(?:([${prefix.symbol.join("")}])|(${prefix.text.join("|")}):)`);
	}

}

const defaultOptions = {
	whitespaces: /\s/,
	comments: false,
	inlineComments: true,
	strings: false,
	regexp: false
};

/**
 * Parses an input without consuming it.
 */
class Parser {

	constructor(input, regexp, position) {
		this.input = input;
		this.index = 0;
		this.line = 0;
		this.lineIndex = 0;
		this.last = undefined;
		this.lastIndex = undefined;
		this.regexp = regexp;
		this.parseTemplateLiteral = null;
		this.parentheses = [];
		this.lastParenthesis = undefined;
		this.options = Object.assign({}, defaultOptions);
		this._position = position || {index: 0, line: 0, column: 0};
	}

	get position() {
		const index = this._position.index + this.index;
		const line = this._position.line + this.line;
		const column = this.index - this.lineIndex + (this.line === 0 ? this._position.column : 0);
		return {index, line, column};
	}

	/**
	 * Throws an error showing the given message and the current reading index.
	 * @throws {ParserError}
	 * @since 0.33.0
	 */
	error(message){
		this.errorAt(this.position, message);
	}

	/**
	 * Throws an error at the given position.
	 * @throws {ParserError}
	 * @since 0.71.0
	 */
	errorAt(position, message){
		var endIndex = this.input.substr(position.index).indexOf("\n");
		var start = this.input.substring(0, position.index).lastIndexOf("\n") + 1;
		var end = endIndex == -1 ? this.input.length : position.index + endIndex;
		message += "\n" + this.input.substring(start, end) + "\n";
		for(var i=start; i<end; i++) message += i == position.index ? "^" : (this.input.charAt(i) == "\t" ? "\t" : " ");
		throw new ParserError(`Line ${position.line + 1}, Column ${position.column}: ${message}`);
	}

	/**
	 * Indicates whether the index has reached the input's length.
	 * @returns true if index is equals or greater than the input's length.
	 */
	eof(){
		return this.index >= this.input.length;
	}

	/**
	 * Peeks the next character without altering the reading index.
	 * @returns The character read.
	 */
	peek(){
		return this.input[this.index];
	}

	/**
	 * Reads the next character and increments the reading index.
	 * @returns The character read.
	 * @since 0.19.0
	 */
	read(){
		return this.input[this.index++];
	}

	/**
	 * Reads the next string only if it is equal to the given one.
	 * @param {string} value - The string to check against
	 * @returns The given string if a match was found, false otherwise.
	 * @since 0.68.0
	 */
	readIf(value){
		const sub = this.input.substr(this.index, value.length);
		if(value === sub) {
			this.index += value.length;
			return value;
		} else {
			return false;
		}
	}

	/**
	 * Asserts that the next character is equal to the given one and increases the
	 * current index.
	 * @param {string} c - The character that will be compared to the one at the current index.
	 * @throws {ParserError} When the character at the current index is different from the given one.
	 * @since 0.16.0
	 */
	expect(c){
		var curr = this.input[this.index++];
		if(curr !== c) {
			this.index--;
			this.error(`Expected \`${c}\` but got \`${curr}\`.`);
		}
	}

	/**
	 * Asserts that the next n characters are equals to the given sequence. If they are,
	 * the current index is increased by the given sequence's length.
	 * @param {string} seq - A string of any length.
	 * @throws {ParserError} When the sequence is different from the remaining input.
	 * @since 0.74.0
	 */
	expectSequence(seq){
		if(seq != this.input.substr(this.index, seq.length)) {
			this.error(`Expected \`${seq}\`.`);
		} else {
			this.index += seq.length;
		}
	}

	/**
	 * Indicates whether the last keyword ending at the given index
	 * is equal to the given value.
	 * @since 0.57.0
	 */
	lastKeywordAt(index, value){
		return this.input.charAt(index) === value.charAt(value.length - 1)
			&& this.input.substring(index - value.length + 1, index + 1) == value
			&& !/[a-zA-Z0-9_$.]/.test(this.input.charAt(index - value.length));
	}

	/**
	 * Indicates whether one of the given keywords is equal to the last keyword
	 * ending at the given index.
	 * @since 0.57.0
	 */
	lastKeywordAtIn(index){
		for(var i=1; i<arguments.length; i++) {
			if(this.lastKeywordAt(index, arguments[i])) return true;
		}
		return false;
	}

	/**
	 * Indicates whether the last keyword is equal to the given value.
	 * @since 0.41.0
	 */
	lastKeyword(value){
		return this.lastKeywordAt(this.lastIndex, value);
	}

	/**
	 * Indicates whether one of the given keywords is equal to the last keyword.
	 * @since 0.57.0
	 */
	lastKeywordIn(){
		for(var i=0; i<arguments.length; i++) {
			if(this.lastKeyword(arguments[i])) return true;
		}
		return false;
	}

	/**
	 * Checks whether the last keyword is a plus or a minus sign and is not preceded
	 * by another plus or minus sign, hence it is not a post increment/decrement.
	 * @since 0.128.0
	 */
	lastKeywordIsPlusMinus(){
		if(this.last == "+" || this.last == "-") {
			return this.input.charAt(this.lastIndex - 1) != this.last
				|| !/[a-zA-Z0-9_$]\s*$/.test(this.input.substring(0, this.lastIndex - 1));
		} else {
			return false;
		}
	}

	/**
	 * Indicates whether the conditions for a regular expression to start are met.
	 * @since 0.50.0
	 */
	couldStartRegExp(){
		return this.last === undefined
			|| !this.last.match(/^[a-zA-Z0-9_$'"`)\].+-]$/)
			|| this.lastKeywordIn("return", "throw", "typeof", "do", "in", "instanceof", "new", "delete", "else")
			|| this.last == ")" && this.lastParenthesis && this.lastKeywordAtIn(this.lastParenthesis.lastIndex, "if", "else", "for", "while", "with")
			|| /\n/.test(this.input.substring(this.lastIndex, this.index)) && this.lastKeywordIn("++", "--", "break", "continue")
			|| this.lastKeywordIsPlusMinus();
	}

	/**
	 * Skips whitespaces, comments (if options.comments !== false) and
	 * strings (if options.strings !== false).
	 * @returns The skipped data.
	 * @throws {ParserError} When a string or a comment is not properly closed.
	 * @since 0.19.0
	 */
	skipImpl(options){
		options = Object.assign({}, defaultOptions, options);
		var prelast = this.last;
		var prelastIndex = this.lastIndex;
		var ret = "";
		while(!this.eof()) {
			let next = this.peek();
			let comment;
			if(options.whitespaces && options.whitespaces.test(next)) {
				ret += this.read();
			} else if(options.comments && next === "/" && ((comment = this.input[this.index + 1]) === "/" && options.inlineComments || comment === "*")) {
				ret += this.read() + this.read() + (comment === "/" ? this.findSequence("\n", false) : this.findSequence("*/", false));
				this.last = undefined;
			} else if(options.strings && (next === "\"" || next === "'" || next === "`")) {
				ret += this.skipString();
				prelast = this.last;
				prelastIndex = this.index;
			} else if(options.regexp && next === "/" && this.couldStartRegExp()) {
				ret += this.skipRegExp();
				prelast = this.last;
				prelastIndex = this.index;
			} else {
				if(next === "\n") {
					this.line++;
					this.lastLine = this.index;
				}
				this.last = prelast;
				this.lastIndex = prelastIndex;
				break;
			}
		}
		return ret;
	}

	/**
	 * Calls {@link skipImpl} using the default options obtained in the constructor.
	 * @returns The skipped data.
	 * @throws {ParserError} When a string or a comment is not properly closed.
	 */
	skip(){
		return this.skipImpl(this.options);
	}

	skipEscapableContent(message){
		var start = this.position;
		var type = this.read();
		var search = ["\\", type];
		if(type == "`") search.push("$");
		var ret = type;
		while(!this.eof()) {
			var result = this.find(search, false, false);
			ret += result.pre;
			if(!result.match) {
				this.error(`Could not find end of ${message()} started at line ${start.line} column ${start.column}`);
			} else if(result.match === "\\") {
				// skip escaped character
				ret += "\\" + this.read();
			} else if(result.match === "$" && this.peek() === "{") {
				const f = this.parseTemplateLiteral;
				const enclosed = this.skipEnclosedContent().slice(1, -1);
				ret += "${" + (typeof f === "function" ? f(enclosed, this) : enclosed) + "}";
			} else {
				break;
			}
		}
		return ret + type;
	}

	/**
	 * Skips and returns a string.
	 * This function skips data until the first character is found again and is
	 * not escaped using a backslash.
	 * @throws {ParserError} When the string is not properly closed.
	 * @since 0.19.0
	 */
	skipString(){
		var ret = this.skipEscapableContent(() => "string");
		this.last = this.input[this.lastIndex = this.index - 1];
		return ret;
	}

	/**
	 * Skips and returns a regular expression.
	 * @throws {ParserError} When the regular expression is not properly terminated.
	 * @since 0.50.0
	 */
	skipRegExp(){
		var ret = this.skipEscapableContent(() => "regular expression");
		var flags = ["g", "i", "m", "s", "u", "y"];
		var index;
		while((index = flags.indexOf(this.peek())) != -1) {
			flags.splice(index, 1);
			ret += this.read();
		}
		this.lastIndex = this.index - 1;
		this.last = "a"; // behave like it was a variable name
		return ret;
	}

	/**
	 * Skips and returns an expression that starts with a parenthesis, bracket or brace.
	 * Comments, strings and regular expressions are skipped too and their content is not treated
	 * as possible enclosures.
	 * @params {boolean} trim - Whether to remove the first and last parenthesis. False by default
	 * @throws {ParserError} When the enclosure is not properly closed.
	 * @since 0.20.0
	 */
	skipEnclosedContent(trim){
		this.lastEnclosureIndex = this.index;
		var par = {"}": "{", "]": "[", ")": "("};
		var ret = this.last = this.read();
		var count = {"{": 0, "[": 0, "(": 0};
		while(!this.eof()) {
			var result = this.find(["{", "}", "[", "]", "(", ")"], true, {comments: true, strings: true, regexp: true});
			ret += result.pre + result.match;
			var close = par[result.match];
			var open = count[result.match];
			if(close) {
				count[close]--;
				if(count[close] < 0) return trim ? ret.slice(1, -1) : ret;
			} else if(open !== undefined) {
				count[result.match]++;
			}
		}
		this.error("Expression not completed.");
	}

	/**
	 * Finds one of the characters in the given array.
	 * @param {string[]} search - An array containing the characters to be found.
	 * @param {boolean=} force - Whether to throw an error if none of the characters in `search` could be found.
	 * @param {boolean=} skip - Whether to call {@link skip} or search the whole input.
	 * @returns An object with the data before the match (`pre` property) and the match (`match` property).
	 * @throws {ParserError} When a string or a comment is not closed or force is true and none
	 *                       of the given characters could be found.
	 */
	find(search, force, skip){
		var ret = "";
		while(!this.eof()) {
			if(skip) {
				ret += typeof skip == "object" ? this.skipImpl(skip) : this.skip();
			}
			let next = this.input[this.index++];
			if(search.indexOf(next) != -1) {
				return {pre: ret, match: next};
			} else {
				if(next) {
					ret += next;
					if(next === "\n") {
						this.line++;
						this.lineIndex = this.index - 1;
					}
				}
				this.last = next;
				this.lastIndex = this.index - 1;
			}
		}
		if(force && this.eof()) {
			if(search.length == 1) {
				this.error(`Expected \`${search[0]}\` but not found.`);
			} else {
				this.error(`Expected one of ${search.map(value => "`" + value + "`").join(", ")}, but not found.`);
			}
		}
		return {pre: ret};
	}

	/**
	 * Finds the given sequence (without skipping comments and strings) and sets the
	 * current index to the end of the match.
	 * @param {string} sequence - The sequence to find.
	 * @param {boolean=} force - Whether to throw an error if no match can be found or return an empty string.
	 * @returns The data between the current index and the match (the matched sequence is included).
	 * @throws {ParserError} When force is true and no match could be found.
	 * @since 0.16.0
	 */
	findSequence(sequence, force){
		var index = this.input.substr(this.index).indexOf(sequence);
		if(index == -1) {
			if(force) this.error(`Could not find sequence \`${sequence}\`.`);
			else index = this.input.length;
		}
		var ret = this.input.substr(this.index, index + sequence.length);
		this.index += index + sequence.length;
		return ret;
	}

	/**
	 * Reads from the given regular expression.
	 * @param {RegExp} regex - The regular expression that will be executed against the current input.
	 *                         The start of string caret (^) is not inserted automatically.
	 * @param {boolean=} force - Indicates whether to return false or throw an error when a result could not be found.
	 * @param {function=} message - Optional function lazily evaluated that returns a custom error message.
	 * @throws {ParserError} When the force param is true and a result could not be found.
	 * @since 0.37.0
	 */
	readImpl(regex, force, message){
		var match = regex.exec(this.input.substr(this.index));
		if(match) {
			this.index += match[0].length;
			return match[0];
		} else if(force) {
			this.error(message && message() || (`Regular expression \`${regex}\` could not be satisfied.`));
		} else {
			return false;
		}
	}

	/**
	 * Reads a javascript variable name.
	 * @param {boolean=} force - Indicates whether to return false or throw an error when a result could not be found.
	 * @throws {ParserError} When the force param is true and a result could not be found.
	 * @since 0.36.0
	 */
	readVarName(force){
		return this.readImpl(/^[a-zA-Z_$][a-zA-Z0-9_$]*/, force, () => "Could not find a valid variable name.");
	}

	/**
	 * Reads a tag name.
	 * @param {boolean=} force - Indicates whether to return false or throw an error when a result could not be found.
	 * @throws {ParserError} When the force param is true and a result could not be found.
	 * @since 0.13.0
	 */
	readTagName(force){
		return this.readImpl(this.regexp.tagName, force, () => "Could not find a valid tag name.");
	}

	/**
	 * Reads the prefix of an attribute name.
	 * @returns A prefix or false if none was specified.
	 * @since 0.68.0
	 */
	readAttributePrefix(){
		var match = this.regexp.attributePrefix.exec(this.input.substr(this.index));
		if(match) {
			this.index += match[0].length;
			return match[1] || {
				dir: ":",
				attr: "",
				prop: "@",
				style: "&",
				on: "+",
				bind: "*",
			}[match[2]];
		} else {
			return false;
		}
	}

	/**
	 * Reads an attribute name, without the prefix.
	 * @param {boolean=} force - Indicates whether to return false or throw an error when a result could not be found.
	 * @throws {ParserError} When the force param is true and a result could not be found.
	 * @since 0.22.0
	 */
	readAttributeName(force){
		return this.readImpl(/^[a-zA-Z0-9_$.:!|-]+/, force, () => "Could not find a valid attribute name.");
	}

	/**
	 * Reads an expression wrapped in square brackets (and removes them).
	 * @returns A string if found, false otherwise.
	 * @since 0.42.0
	 */
	readComputedExpr(){
		if(this.peek() === "[") {
			return this.skipEnclosedContent().slice(1, -1);
		} else {
			return false;
		}
	}

	/**
	 * Reads a single operand of an expression.
	 * @param {boolean} skip - Indicates whether the expression (outside of enclosures) can contain whitespaces.
	 * @param {boolean} force - Indicates whether to throw an expeption when an expression cannot be found.
	 * @throws {ParserError} When a string or a regular expression is not terminated.
	 * @returns The expression read or an empty string if no expression could be found.
	 */
	readSingleExpression(skip, force){
		var ret = this.readImpl(this.regexp.singleExpressionPrefix) || "";
		if(skip) ret += this.skipImpl({comments: true});
		var peek = this.peek();
		if(peek == "\"" || peek == "'" || peek == "`") {
			ret += this.skipString();
		} else if(peek == "/") {
			ret += this.skipRegExp();
		} else {
			ret += this.readImpl(/^(([a-zA-Z_$][a-zA-Z0-9_$]*)|0[box][0-9]+|([0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?))/, false) || "";
		}
		while(!this.eof()) {
			var before = {
				ret: ret,
				index: this.index
			};
			if(skip) ret += this.skipImpl({comments: true});
			var expr = this.readImpl(/^(\.((\*|\^)\??)?#?(\[|[a-zA-Z0-9_$]+))/, false);
			if(expr) {
				if(expr.charAt(expr.length - 1) == "[") {
					this.index--;
					ret += expr.slice(0, -1) + this.skipEnclosedContent();
				} else {
					ret += expr;
				}
				if(skip) ret += this.skipImpl({comments: true});
			}
			peek = this.peek();
			if(peek == "{" || peek == "[" || peek == "(") {
				ret += this.skipEnclosedContent();
			} else if(!expr) {
				ret = before.ret;
				this.index = before.index;
				break;
			}
		}
		peek = this.peek();
		if((peek == "+" || peek == "-") && this.input.charAt(this.index + 1) == peek) ret += this.read() + this.read();
		if(force && !ret.length) this.error("Could not find a valid expression.");
		return ret;
	}

	/**
	 * Reads a full expression, which is a sequence of operands and operators.
	 * @throws {ParserError} When a string or a regular expression is not terminated.
	 * @returns The expression read or an empty string if no expression could be found.
	 * @since 0.49.0
	 */
	readExpression(){
		var ret = this.skipImpl({comments: true});
		var expr;
		if(expr = this.readSingleExpression(true)) {
			ret += expr + this.skipImpl({comments: true});
			while(!this.eof() && (expr = this.readImpl(/^(\*\*|&&?|\|\|?|\^|=>|==?=?|!==?|<<|>>>?|\?|:|[+*/%<>-]=?|in(stanceof)?\s)/, false))) {
				ret += expr + this.skipImpl({comments: true});
				if(!(expr = this.readSingleExpression(true)).trim()) this.error("Could not find a valid expression.");
				ret += expr + this.skipImpl({comments: true});
			}
		}
		if(!ret.trim().length) this.error("Could not find a valid expression.");
		else return ret;
	}

	/**
	 * Reads a single expression that cannot contains whitespaces and throws an error if empty.
	 * @throws {ParserError} If no expression could be found.
	 * @since 0.37.0
	 */
	readAttributeValue(){
		return this.readSingleExpression(false) || this.error("Could not find a valid expression for the attribute's value.");
	}

	/**
	 * Reads a valid javascript variable name or an expression wrapped in braces (and replaces them with parentheses).
	 * @param {boolean=} force - Indicates whether to return false or throw an error when a result could not be found.
	 * @throws {ParserError} When the force param is true and a result could not be found.
	 * @since 0.29.0
	 */
	readVar(force){
		if(this.peek() === "{") {
			return "(" + this.skipEnclosedContent().slice(1, -1) + ")";
		} else {
			return this.readVarName(force);
		}
	}

}

module.exports = { ParserError, ParserRegExp, Parser };
