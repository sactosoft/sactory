var Polyfill = require("./polyfill");

function ParserError(message, fileName, lineNumber) {
	var error = new Error(message, fileName, lineNumber);
	Object.setPrototypeOf(error, Object.getPrototypeOf(this));
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
}

Object.defineProperty(Parser.prototype, "position", {
	get: function(){
		var line = this.from.line || 0;
		var last = this.from.column || 0;
		for(var i=0; i<=this.index; i++) {
			if(this.input.charAt(i) == '\n') {
				line++;
				last = i;
			}
		}
		return {
			absolute: this.index + (this.from.absolute || 0),
			line: line,
			column: this.index - last
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
	var start = this.input.substring(0, this.index).lastIndexOf('\n') + 1;
	var end = this.index + this.input.substr(this.index).indexOf('\n');
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
	while(!this.eof()) {
		var next = this.input[this.index];
		if([' ', '\t', '\n', '\r'].indexOf(next) != -1) {
			this.index++;
		} else if(options.comments !== false && next == '/') {
			var comment = this.input[this.index + 1];
			if(comment == '/' && options.inlineComments !== false) {
				this.index += 2;
				this.findSequence("\n", false);
				this.last = undefined;
			} else if(comment == '*') {
				this.index += 2;
				this.findSequence("*/", true);
				this.last = undefined;
			} else {
				this.last = prelast;
				this.lastIndex = prelastIndex;
				prelast = next;
				prelastIndex = this.index;
				break;
			}
		} else if(options.strings !== false && (next == '"' || next == '\'' || next == '`')) {
			this.skipString();
			this.last = prelast = next;
			this.lastIndex = prelastIndex = this.index;
		} else {
			this.last = prelast;
			this.lastIndex = prelastIndex;
			prelast = next;
			prelastIndex = this.index;
			break;
		}
	}
	return this.input.substring(start, this.index);
};

/**
 * Calls {@link skipImpl} using the default options obtained in the constructor.
 * @returns The skipped data.
 * @throws {ParserError} When a string or a comment is not properly closed.
 */
Parser.prototype.skip = function(){
	return this.skipImpl(this.options);
};

/**
 * Skips a string.
 * This function skips data until the first character is found again and is
 * not escaped using a backslash.
 * @throws {ParserError} When the string is not properly closed.
 * @since 0.19.0
 */
Parser.prototype.skipString = function(){
	var type = this.read();
	while(!this.eof()) {
		var result = this.find(['\\', type], false, false);
		if(!result.match) this.error("Could not find end of string.");
		else if(result.match == '\\') this.index++; // skip escaped character
		else break;
	}
};

/**
 * Skips an expression that starts with a parentheses or a bracket.
 * Comments and strings are skipped and their content is not treated as possible
 * parenthesies/brackets.
 * @throws {ParserError} When the expression is not properly closed.
 * @since 0.20.0
 */
Parser.prototype.skipExpr = function(){
	var par = {'}': '{', ']': '[', ')': '('};
	var match = par[this.read()];
	var count = {'{': 0, '[': 0, '(': 0};
	while(!this.eof()) {
		this.skipImpl({comments: true, strings: true});
		var next = this.read();
		var close = par[next];
		var open = count[next];
		if(close) {
			count[close]--;
			if(count[close] < 0) return;
		} else if(open !== undefined) {
			count[next]++;
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
	var start = this.index;
	while(!this.eof()) {
		if(skip) this.skip();
		var next = this.input[this.index++];
		if(search.indexOf(next) != -1) {
			return {pre: this.input.substring(start, this.index - 1), match: next};
		} else {
			this.last = next;
			this.lastIndex = this.index - 1;
		}
	}
	if(force && this.eof()) this.error("Expected [" + search.join(", ") + "] but none found.");
	return {pre: this.input.substr(start)};
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
	var ret = this.input.substring(this.index, this.index + index);
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
	return this.readImpl(/^((~?(\@\@?|\:|\#|\$|\+)?[a-zA-Z_][a-zA-Z0-9_\$\-\.\:]*)|@)/, force, function(){ return "Could not find a valid attribute name."; });
};

/**
 * Reads an expression wrapped in square brackets (and removes them).
 * @returns A string if found, false otherwise.
 * @since 0.42.0
 */
Parser.prototype.readComputedExpr = function(){
	if(this.peek() == '[') {
		var start = this.index;
		this.skipExpr();
		return this.input.substring(start + 1, this.index - 1);
	} else {
		return false;
	}
};

/**
 * Reads an expression wrapped in curly brackets (and removes them) or a string.
 * @returns A string if found, false otherwise.
 * @since 0.43.0
 */
Parser.prototype.readQueryExpr = function(){
	var peek = this.peek();
	if(peek == '{') {
		var start = this.index;
		this.skipExpr();
		return this.input.substring(start + 1, this.index - 1);
	} else if(peek == '"' || peek == '\'' || peek == '`') {
		var start = this.index;
		this.skipString();
		return this.input.substring(start, this.index);
	} else {
		return false;
	}
};

/**
 * Reads an expression or a series of them. Note that this function's behaviour is different
 * from {@link skipExpr}'s one as more than one expression is read and it doesn't need to be
 * wrapped in parentheses or brackets.
 * @returns The expression read or an empty string if no expression could be found.
 */
Parser.prototype.readExpr = function(){
	var start = this.index;
	var peek = this.peek();
	if(peek == '"' || peek == '\'' || peek == '`') {
		this.skipString();
	}
	while(!this.eof()) {
		this.readImpl(/^[a-zA-Z0-9_\$\.]+/, false);
		peek = this.peek();
		if(peek == '{' || peek == '[' || peek == '(') this.skipExpr();
		else break;
	}
	return this.input.substring(start, this.index);
};

/**
 * Reads an expression and throws an error if empty.
 * @throws {ParserError} If no expression could be found.
 * @since 0.37.0
 */
Parser.prototype.readAttributeValue = function(){
	var prefix = (this.peek() == '*' || this.peek() == '@') && this.read() || "";
	var value = this.readExpr();
	if(!value) this.error("Could not find a valid expression for the attribute value.");
	return prefix + value;
};

/**
 * Reads a variable searching a valid javascript variable name or an expression
 * if wrapped around curly brackets.
 * @param {boolean=} force - Indicates whether to return false or throw an error when a result could not be found.
 * @throws {ParserError} When the force param is true and a result could not be found.
 * @since 0.29.0
 */
Parser.prototype.readVar = function(force){
	if(this.peek() == '{') {
		var start = this.index + 1;
		this.skipExpr();
		return '(' + this.input.substring(start, this.index - 1) + ')';
	} else {
		return this.readVarName(force);
	}
};

module.exports = Parser;
