var Polyfill = require("./polyfill");

function ParserError(message, fileName, lineNumber) {
	var error = new Error(message, fileName, lineNumber);
	if(Object.setPrototypeOf) {
		Object.setPrototypeOf(error, Object.getPrototypeOf(this));
	} else {
		error.__proto__ = this.__proto__;
	}
	if(Error.captureStackTrace) Error.captureStackTrace(error, ParserError);
	return error;
}

ParserError.prototype = Object.create(Error.prototype, {
	constructor: {
		value: Error,
		enumerable: false,
		writable: false,
		configurable: false
	}
});

ParserError.prototype.name = "ParserError";

/**
 * Parses an input without consuming it.
 * @class
 */
function Parser(input, from) {
	this.index = 0;
	this.input = input;
	this.last = undefined;
	this.lastIndex = undefined;
	this.options = {};
	this.from = from || {};
	this.parseTemplateLiteral = null;
}

Object.defineProperty(Parser.prototype, "position", {
	get: function(){
		var line = 0;
		var column = 0;
		for(var i=0; i<=this.index; i++) {
			if(this.input.charAt(i) == '\n') {
				line++;
				column = -1;
			} else {
				column++;
			}
		}
		return {
			absolute: this.index + (this.from && this.from.absolute - this.input.length || 0),
			line: line + (this.from && this.from.line - (this.input.match(/\n/g) || []).length || 0),
			column: column + (this.from && this.from.column - this.input.length || 0)
		};
	}
});

/**
 * Throws an error showing the given message and the current reading index.
 * @throws {ParserError}
 * @since 0.33.0
 */
Parser.prototype.error = function(message){
	var position = this.position;
	var endIndex = this.input.substr(this.index).indexOf('\n');
	var start = this.input.substring(0, this.index).lastIndexOf('\n') + 1;
	var end = endIndex == -1 ? this.input.length : this.index + endIndex;
	message += '\n' + this.input.substring(start, end) + '\n';
	for(var i=start; i<end; i++) message += i == this.index ? '^' : (this.input.charAt(i) == '\t' ? '\t' : ' ');
	throw new ParserError("Line " + (position.line + 1) + ", Column " + position.column + ": " + message);
};

/**
 * Indicates whether the index has reached the input's length.
 * @returns true if index is equals or greater than the input's length.
 */
Parser.prototype.eof = function(){
	return this.index >= this.input.length;
};

/**
 * Peeks the next character without altering the reading index.
 * @returns The character read.
 */
Parser.prototype.peek = function(){
	return this.input[this.index];
};

/**
 * Reads the next character and increments the reading index.
 * @returns The character read.
 * @since 0.19.0
 */
Parser.prototype.read = function(){
	return this.input[this.index++];
};

/**
 * Asserts that the next character is equal to the given one and increases the
 * current index.
 * @param {string} c - The character that will be compared to the one at the current index.
 * @throws {ParserError} When the character at the current index is different from the given one.
 * @since 0.16.0
 */
Parser.prototype.expect = function(c){
	var curr = this.input[this.index++];
	if(curr !== c) this.error("Expected '" + c + "' but got '" + curr + "'.");
};

/**
 * Indicates whether the last keyword is equal to the given value.
 * @since 0.41.0
 */
Parser.prototype.lastKeyword = function(value){
	return this.last === value.charAt(value.length - 1) && this.input.substring(this.lastIndex - value.length + 1, this.lastIndex + 1) == value;
};

/**
 * Indicates whether the conditions for a regular expression to start are met. That is,
 * when there is no last character, when the last character is not a keyword or a function
 * call, or when the last keyword is `return` or `typeof`.
 * @since 0.50.0
 */
Parser.prototype.couldStartRegExp = function(){
	return this.last === undefined || !this.last.match(/^[a-zA-Z0-9_$\)\]\.]$/) || this.lastKeyword("return") || this.lastKeyword("typeof");
};

/**
 * Skips whitespaces, comments (if options.comments !== false) and
 * strings (if options.strings !== false).
 * @returns The skipped data.
 * @throws {ParserError} When a string or a comment is not properly closed.
 * @since 0.19.0
 */
Parser.prototype.skipImpl = function(options){
	var start = this.index;
	var prelast = this.last;
	var prelastIndex = this.lastIndex;
	var ret = "";
	while(!this.eof()) {
		var next = this.peek();
		var comment;
		if(/\s/.test(next)) {
			ret += this.read();
		} else if(options.comments !== false && next == '/' && ((comment = this.input[this.index + 1]) == '/' && options.inlineComments !== false || comment == '*')) {
			ret += this.read() + this.read() + (comment == '/' ? this.findSequence("\n", false) : this.findSequence("*/", false));
			this.last = undefined;
		} else if(options.strings !== false && (next == '"' || next == '\'' || next == '`')) {
			ret += this.skipString();
		} else if(options.regexp === true && next == '/' && this.couldStartRegExp()) {
			ret += this.skipRegExp();
		} else {
			this.last = prelast;
			this.lastIndex = prelastIndex;
			prelast = next;
			prelastIndex = this.index;
			break;
		}
	}
	return ret;
};

/**
 * Calls {@link skipImpl} using the default options obtained in the constructor.
 * @returns The skipped data.
 * @throws {ParserError} When a string or a comment is not properly closed.
 */
Parser.prototype.skip = function(){
	return this.skipImpl(this.options);
};

Parser.prototype.skipEscapableContent = function(message){
	var start = this.position;
	var type = this.read();
	var search = ['\\', type];
	if(type == '`') search.push('$');
	var ret = type;
	while(!this.eof()) {
		var result = this.find(search, false, false);
		ret += result.pre;
		if(!result.match) this.error("Could not find end of " + message() + " started at line " + start.line + " column " + start.column);
		else if(result.match == '\\') ret += '\\' + this.read(); // skip escaped character
		else if(result.match == '$' && this.peek() == '{'){ var e = this.skipEnclosedContent().slice(1, -1); ret += "${" + (typeof this.parseTemplateLiteral == "function" ? this.parseTemplateLiteral(e, this) : e) + '}'; }
		else break;
	}
	return ret + type;
};

/**
 * Skips and returns a string.
 * This function skips data until the first character is found again and is
 * not escaped using a backslash.
 * @throws {ParserError} When the string is not properly closed.
 * @since 0.19.0
 */
Parser.prototype.skipString = function(){
	var ret = this.skipEscapableContent(function(){ return "string"; });
	this.last = this.input[this.lastIndex = this.index];
	return ret;
};

/**
 * Skips and returns a regular expression.
 * @throws {ParserError} When the regular expression is not properly terminated.
 * @since 0.50.0
 */
Parser.prototype.skipRegExp = function(){
	var ret = this.skipEscapableContent(function(){ return "regular expression"; });
	var flags = ['g', 'i', 'm', 's', 'u', 'y'];
	var index;
	while((index = flags.indexOf(this.peek())) != -1) {
		flags.splice(index, 1);
		ret += this.read();
	}
	this.last = this.input[this.lastIndex = this.index];
	return ret;
};

/**
 * Skips and returns an expression that starts with a parenthesis, bracket or brace.
 * Comments, strings and regular expressions are skipped too and their content is not treated
 * as possible enclosures.
 * @throws {ParserError} When the enclosure is not properly closed.
 * @since 0.20.0
 */
Parser.prototype.skipEnclosedContent = function(){
	var par = {'}': '{', ']': '[', ')': '('};
	var ret = this.read();
	var match = par[ret];
	var count = {'{': 0, '[': 0, '(': 0};
	while(!this.eof()) {
		var result = this.find(['{', '}', '[', ']', '(', ')'], true, {comments: true, strings: true, regexp: true});
		ret += result.pre + result.match;
		var close = par[result.match];
		var open = count[result.match];
		if(close) {
			count[close]--;
			if(count[close] < 0) return ret;
		} else if(open !== undefined) {
			count[result.match]++;
		}
	}
	this.error("Expression not completed.");
};

/**
 * Finds one of the characters in the given array.
 * @param {string[]} search - An array containing the characters to be found.
 * @param {boolean=} force - Whether to throw an error if none of the characters in `search` could be found.
 * @param {boolean=} skip - Whether to call {@link skip} or search the whole input.
 * @returns An object with the data before the match (`pre` property) and the match (`match` property).
 * @throws {ParserError} When a string or a comment is not closed or force is true and none of the given characters could be found.
 */
Parser.prototype.find = function(search, force, skip){
	var ret = "";
	while(!this.eof()) {
		if(skip) ret += typeof skip == "object" ? this.skipImpl(skip) : this.skip();
		var next = this.input[this.index++];
		if(search.indexOf(next) != -1) {
			return {pre: ret, match: next};
		} else {
			if(next) ret += next;
			this.last = next;
			this.lastIndex = this.index - 1;
		}
	}
	if(force && this.eof()) this.error("Expected [" + search.join(", ") + "] but none found.");
	return {pre: ret};
};

/**
 * Finds the given sequence (without skipping comments and strings) and sets the
 * current index to the end of the match.
 * @param {string} sequence - The sequence to find.
 * @param {boolean=} force - Whether to throw an error if no match can be found or return an empty string.
 * @returns The data between the current index and the match (the matched sequence is not included).
 * @throws {ParserError} When force is true and no match could be found.
 * @since 0.16.0
 */
Parser.prototype.findSequence = function(sequence, force){
	var index = this.input.substr(this.index).indexOf(sequence);
	if(index == -1) {
		if(force) this.error("Could not find sequence '" + sequence + "'.");
		else index = this.input.length;
	}
	var ret = this.input.substr(this.index, index + sequence.length);
	this.index += index + sequence.length;
	return ret;
};

/**
 * Reads from the given regular expression.
 * @param {RegExp} regex - The regular expression that will be executed against the current input. The start of string caret (^) is not inserted automatically.
 * @param {boolean=} force - Indicates whether to return false or throw an error when a result could not be found.
 * @param {function=} message - Optional function lazily evaluated that returns a custom error message.
 * @throws {ParserError} When the force param is true and a result could not be found.
 * @since 0.37.0
 */
Parser.prototype.readImpl = function(regex, force, message){
	var match = regex.exec(this.input.substr(this.index));
	if(match) {
		this.index += match[0].length;
		return match[0];
	} else if(force) {
		this.error(message && message() || ("Regular expression '" + regex + "' could not be satisfied."));
	} else {
		return false;
	}
};

/**
 * Reads a javascript variable name.
 * @param {boolean=} force - Indicates whether to return false or throw an error when a result could not be found.
 * @throws {ParserError} When the force param is true and a result could not be found.
 * @since 0.36.0
 */
Parser.prototype.readVarName = function(force){
	return this.readImpl(/^[a-zA-Z_\$][a-zA-Z0-9_\$]*/, force, function(){ return "Could not find a valid variable name."; });
};

/**
 * Reads a tag name.
 * @param {boolean=} force - Indicates whether to return false or throw an error when a result could not be found.
 * @throws {ParserError} When the force param is true and a result could not be found.
 * @since 0.13.0
 */
Parser.prototype.readTagName = function(force){
	return this.readImpl(/^(([\#\@]?[a-zA-Z0-9_\-\.\:\$]+)|@)/, force, function(){ return "Could not find a valid tag name."; });
};

/**
 * Reads an attribute name.
 * @param {boolean=} force - Indicates whether to return false or throw an error when a result could not be found.
 * @throws {ParserError} When the force param is true and a result could not be found.
 * @since 0.22.0
 */
Parser.prototype.readAttributeName = function(force){
	return this.readImpl(/^((~?(\@\@?|\:|\#|\$|\*\*?\*?|\+)?[a-zA-Z_][a-zA-Z0-9_\$\-\.\:]*)|@)/, force, function(){ return "Could not find a valid attribute name."; });
};

/**
 * Reads an expression wrapped in square brackets (and removes them).
 * @returns A string if found, false otherwise.
 * @since 0.42.0
 */
Parser.prototype.readComputedExpr = function(){
	if(this.peek() == '[') {
		return this.skipEnclosedContent().slice(1, -1);
	} else {
		return false;
	}
};

/**
 * Reads an expression wrapped in braces (and removes them) or a string.
 * @returns A string if found, false otherwise.
 * @since 0.43.0
 */
Parser.prototype.readQueryExpr = function(){
	var peek = this.peek();
	if(peek == '{') {
		return this.skipEnclosedContent().slice(1, -1);
	} else if(peek == '"' || peek == '\'' || peek == '`') {
		return this.skipString();
	} else {
		return false;
	}
};

/**
 * Reads a single operand of an expression.
 * @param {boolean} skip - Indicates whether the expression (outside of enclosures) can contain whitespaces.
 * @throws {ParserError} When a string or a regular expression is not terminated.
 * @returns The expression read or an empty string if no expression could be found.
 */
Parser.prototype.readSingleExpression = function(skip){
	var ret = this.readImpl(/^([-+~!]*((new|delete|typeof)\s+)?\*{0,3}@{0,2})/) || "";
	if(skip) ret += this.skipImpl({strings: false});
	var peek = this.peek();
	if(peek == '"' || peek == '\'' || peek == '`') {
		ret += this.skipString();
	} else if(peek == '/') {
		ret += this.skipRegExp();
	} else {
		ret += this.readImpl(/^(([a-zA-Z_$][a-zA-Z0-9_$]*)|([0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?))/, false) || "";
	}
	while(!this.eof()) {
		var before = {
			ret: ret,
			index: this.index
		};
		if(skip) ret += this.skipImpl({strings: false});
		var expr = this.readImpl(/^(\.[a-zA-Z0-9_\$]+)/, false);
		if(expr) {
			ret += expr;
			if(skip) ret += this.skipImpl({strings: false});
		}
		peek = this.peek();
		if(peek == '{' || peek == '[' || peek == '(') ret += this.skipEnclosedContent();
		else if(!expr) {
			ret = before.ret;
			this.index = before.index;
			break;
		}
	}
	if((peek == '+' || peek == '-') && this.input.charAt(this.index + 1) == peek) ret += this.read() + this.read();
	return ret;
};

/**
 * Reads a full expression, which is a sequence of operands and operators.
 * @throws {ParserError} When a string or a regular expression is not terminated.
 * @returns The expression read or an empty string if no expression could be found.
 * @since 0.49.0
 */
Parser.prototype.readExpression = function(){
	var ret = this.skipImpl({strings: false});
	var expr;
	if(expr = this.readSingleExpression(true)) {
		ret += expr + this.skipImpl({strings: false});
		while(!this.eof() && (expr = this.readImpl(/^(\*\*|&&?|\|\|?|\^|=>|==?=?|!==?|<<|>>>?|\?|:|[\+\-\*\/%<>]=?|in(stanceof)?\s)/, false))) {
			ret += expr + this.skipImpl({strings: false});
			if(!(expr = this.readSingleExpression(true))) this.error("Could not find a valid expression.");
			ret += expr + this.skipImpl({strings: false});
		}
	}
	if(!ret.trim()) this.error("Could not find a valid expression.");
	else return ret;
};

/**
 * Reads a single expression that cannot contains whitespaces and throws an error if empty.
 * @throws {ParserError} If no expression could be found.
 * @since 0.37.0
 */
Parser.prototype.readAttributeValue = function(){
	return this.readSingleExpression(false) || this.error("Could not find a valid expression for the attribute's value.");
};

/**
 * Reads a valid javascript variable name or an expression wrapped in braces (and replaces them with parentheses).
 * @param {boolean=} force - Indicates whether to return false or throw an error when a result could not be found.
 * @throws {ParserError} When the force param is true and a result could not be found.
 * @since 0.29.0
 */
Parser.prototype.readVar = function(force){
	if(this.peek() == '{') {
		return '(' + this.skipEnclosedContent().slice(1, -1) + ')';
	} else {
		return this.readVarName(force);
	}
};

module.exports = Parser;
