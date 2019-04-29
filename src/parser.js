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

//Object.setPrototypeOf(ParserError, Error);

function Parser(input) {
	this.index = 0;
	this.input = input;
	this.last = undefined;
	this.options = {};
}

Parser.prototype.error = function(message){
	var line = 0;
	for(var i=0; i<=this.index; i++) {
		if(this.input.charAt(i) == '\n') line++;
	}
	throw new ParserError("Line " + line + ": " + message);
};

Parser.prototype.eof = function(){
	return this.index >= this.input.length;
};

Parser.prototype.peek = function(){
	return this.input[this.index];
};

Parser.prototype.read = function(){
	return this.input[this.index++];
};

Parser.prototype.expect = function(c){
	var curr = this.input[this.index++];
	if(curr !== c) this.error("Expected '" + c + "' but got '" + curr + "'.");
};

/**
 * Skips whitespaces, comments (if options.comments !== false) and
 * strings (if options.strings !== false).
 */
Parser.prototype.skipImpl = function(options){
	var start = this.index;
	var prelast = this.last;
	while(!this.eof()) {
		var next = this.input[this.index];
		if([' ', '\t', '\n', '\r'].indexOf(next) != -1) {
			this.index++;
		} else if(options.comments !== false && next == '/') {
			var comment = this.input[this.index + 1];
			if(comment == '/') {
				this.index += 2;
				this.findSequence("\n", false);
				this.last = undefined;
			} else if(comment == '*') {
				this.index += 2;
				this.findSequence("*/", true);
				this.last = undefined;
			} else {
				this.last = prelast;
				prelast = next;
				break;
			}
		} else if(options.strings !== false && (next == '"' || next == '\'' || next == '`')) {
			this.skipString();
			this.last = prelast = next;
		} else {
			this.last = prelast;
			prelast = next;
			break;
		}
	}
	return this.input.substring(start, this.index);
};

Parser.prototype.skip = function(){
	return this.skipImpl(this.options);
};

Parser.prototype.skipString = function(){
	var type = this.read();
	while(!this.eof()) {
		var result = this.find(['\\', type], false, false);
		if(!result.match) this.error("Could not find end of string.");
		else if(result.match == '\\') this.index++; // skip escaped character
		else break;
	}
};

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

Parser.prototype.find = function(search, force, skip){
	var start = this.index;
	while(!this.eof()) {
		if(skip) this.skip();
		var next = this.input[this.index++];
		if(search.indexOf(next) != -1) return {pre: this.input.substring(start, this.index - 1), match: next};
		else this.last = next;
	}
	if(force && this.eof()) this.error("Expected [" + search.join(", ") + "] but not found.");
	return {pre: this.input.substr(start)};
};

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

Parser.prototype.readName = function(force){
	var match = /^[a-zA-Z0-9_\-\.]+/.exec(this.input.substr(this.index));
	if(match) {
		this.index += match[0].length;
		return match[0];
	} else if(force === false) {
		return false;
	} else {
		this.error("Name not found.");
	}
};

Parser.prototype.readVarName = function(force){
	var match = /^[a-zA-Z_\$][a-zA-Z0-9_\$]*/.exec(this.input.substr(this.index));
	if(match) {
		this.index += match[0].length;
		return match[0];
	} else {
		this.error("Could not find a valid variable name.");
	}
};

Parser.prototype.readTagName = function(){
	var match = /^((\*(head|body))|([\#\&]?[a-zA-Z0-9_\-\.\:\$]*))/.exec(this.input.substr(this.index));
	if(match) {
		this.index += match[0].length;
		return match[0];
	} else {
		this.error("Could not find a valid tag name.");
	}
};

Parser.prototype.readAttributeName = function(){
	var match = /^~?(\@\@?|\#|\*|\$|\+)?[a-zA-Z0-9_\-\.\:]*/.exec(this.input.substr(this.index));
	if(match) {
		this.index += match[0].length;
		return match[0];
	} else {
		this.error("Could not find a valid attribute name");
	}
};

Parser.prototype.readComputedExpr = function(){
	var peek = this.peek();
	if(peek == '[') {
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

Parser.prototype.readExpr = function(){
	var start = this.index;
	var peek = this.peek();
	if(peek == '"' || peek == '\'' || peek == '`') {
		this.skipString();
	} else {
		while(!this.eof()) {
			this.readName(false);
			peek = this.peek();
			if(peek == '{' || peek == '[' || peek == '(') this.skipExpr();
			else break;
		}
	}
	return this.input.substring(start, this.index);
};

Parser.prototype.readVar = function(){
	if(this.peek() == '{') {
		var start = this.index + 1;
		this.skipExpr();
		return '(' + this.input.substring(start, this.index - 1) + ')';
	} else {
		return this.readVarName();
	}
};

module.exports = Parser;
