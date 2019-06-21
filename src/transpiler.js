// init global variables
require("./dom");

var Polyfill = require("./polyfill");
var Parser = require("./parser");

var version = require("../version");

var performance = require("perf_hooks").performance;

function hash(str) {
	var hash = 0;
	for(var i=0; i<str.length; i++) {
		hash += str.charCodeAt(i) * 16777619;
	}
	return hash;
}

function uniq(array) {
	return array.filter(function(value, i){
		return array.indexOf(value) == i;
	});
}

function stringify(str) {
	// that's not very fast
	return '"' + str.replace(/(\r?\n)|([\\"])/gm, function(_, newline, escaped){
		if(newline) return "\\n\\\n";
		else return '\\' + escaped;
	}) + '"';
}

function now() {
	return performance.now ? performance.now() : new Date().getTime();
}

var modeRegistry = [];
var modeNames = {};
var defaultMode;

/**
 * @since 0.15.0
 */
Transpiler.defineMode = function(names, parser, isDefault){
	var id = modeRegistry.length;
	modeRegistry.push({
		name: names[0],
		parser: parser
	});
	names.forEach(function(name){
		modeNames[name] = id;
	});
	if(isDefault) defaultMode = id;
	return id;
};

/**
 * @since 0.53.0
 */
Transpiler.getModeByName = function(name){
	return modeNames[name];
};

/**
 * @since 0.53.0
 */
Transpiler.replaceMode = function(mode, parser){
	modeRegistry[mode].parser = parser;
};

/**
 * @since 0.35.0
 */
Transpiler.startMode = function(mode, transpiler, parser, source, attributes){
	var m = modeRegistry[mode];
	var ret = new m.parser(transpiler, parser, source, attributes || {});
	ret.options = parser.options = m.parser.getOptions();
	return ret;
};

/**
 * @class
 * @since 0.15.0
 */
function SourceParser(transpiler, parser, source, attributes) {
	this.transpiler = transpiler;
	this.parser = parser;
	this.source = source;
	this.runtime = transpiler.runtime;
	this.element = transpiler.element;
	this.bind = transpiler.bind;
	this.anchor = transpiler.anchor;
	this.attributes = attributes;
}

SourceParser.prototype.add = function(text){
	this.source.push(text);
};

/**
 * @since 0.69.0
 */
SourceParser.prototype.parseCode = function(fun){
	this.parser.parseTemplateLiteral = null;
	var expr = Parser.prototype[fun].apply(this.parser, Array.prototype.slice.call(arguments, 1));
	this.transpiler.updateTemplateLiteralParser();
	return this.transpiler.parseCode(expr, this.parser);
};

SourceParser.prototype.parseCodeToSource = function(fun){
	var expr = Parser.prototype[fun].apply(this.parser, Array.prototype.slice.call(arguments, 1));
	return this.transpiler.parseCode(expr, this.parser).source;
};

SourceParser.prototype.parseCodeToValue = function(fun){
	return this.parseCode.apply(this, arguments).toValue();
};

SourceParser.prototype.start = function(){};

SourceParser.prototype.end = function(){};

SourceParser.prototype.afterappend = function(){};

SourceParser.prototype.beforeremove = function(){};

SourceParser.prototype.parse = function(handle, eof){};

/**
 * @class
 * @since 0.29.0
 */
function BreakpointParser(transpiler, parser, source, attributes, breakpoints) {
	SourceParser.call(this, transpiler, parser, source, attributes);
	this.breakpoints = ['<'].concat(breakpoints);
}

BreakpointParser.prototype = Object.create(SourceParser.prototype);

BreakpointParser.prototype.next = function(match){};

BreakpointParser.prototype.parse = function(handle, eof){
	var result = this.parser.find(this.breakpoints, false, true);
	if(result.pre) this.add(result.pre);
	if(result.match == '<') {
		if(this.parser.options.code && !this.parser.couldStartRegExp()) {
			// just a comparison
			this.add("<");
			this.parser.last = '<';
			this.parser.lastIndex = this.parser.index;
		} else {
			handle();
		}
	} else if(result.match) {
		this.next(result.match);
	} else {
		eof();
	}
};

/**
 * @class
 * @since 0.28.0
 */
function TextParser(transpiler, parser, source, attributes) {
	SourceParser.call(this, transpiler, parser, source, attributes);
	this.current = [];
}

TextParser.prototype = Object.create(SourceParser.prototype);

TextParser.prototype.addText = function(expr){
	this.add(this.runtime + "." + this.transpiler.feature("text") + "(" + this.element + ", " + this.bind + ", " + this.anchor + ", " + expr + ");");
};

TextParser.prototype.addCurrent = function(){
	if(this.attributes.trimmed && this.current.length == 1 && this.current[0].text && /^\s*$/.test(this.current[0].value)) {
		// just whitespace
		this.add(this.current[0].value);
	} else {
		var expr = [];
		var observables = [];
		var maybeObservables = [];
		for(var i in this.current) {
			var curr = this.current[i];
			if(curr.text) {
				if(curr.value.length) expr.push(stringify(this.replaceText(curr.value)));
			} else {
				Array.prototype.push.apply(observables, curr.value.observables);
				Array.prototype.push.apply(maybeObservables, curr.value.maybeObservables);
				expr.push('(' + curr.value.source + ')'); 
			}
		}
		if(expr.length) {
			var joined = expr.join(" + ");
			if(observables.length || maybeObservables.length) {
				joined = this.runtime + "." + this.transpiler.feature(maybeObservables.length ? "maybeComputedObservable" : "computedObservable") + "(this, " + this.bind + ", [" +
					uniq(observables).join(", ") + "], function(){return " + joined + "}" + (maybeObservables.length ? ", [" + maybeObservables.join(", ") + "]" : "") + ")";
			}
			this.addText(joined);
		}
	}
	this.current = [];
};

TextParser.prototype.addFinalCurrent = function(){
	this.addCurrent();
};

TextParser.prototype.pushText = function(value){
	var last = this.current[this.current.length - 1];
	if(last && last.text) last.value += value;
	else this.current.push({text: true, value: value});
};

TextParser.prototype.pushExpr = function(value){
	this.current.push({text: false, value: value});
};

TextParser.prototype.trimEnd = function(){
	var ret = "";
	var end = this.current[this.current.length - 1];
	if(end.text) {
		var trimmed = Polyfill.trimEnd.call(end.value);
		ret = end.value.substr(trimmed.length);
		end.value = trimmed;
	}
	return ret;
};

TextParser.prototype.replaceText = function(text){
	return text;
};

TextParser.prototype.handle = function(){
	return true;
};

TextParser.prototype.parseImpl = function(pre, match, handle, eof){
	switch(match) {
		case '$':
		case '#':
			if(pre.slice(-1) == '\\') {
				this.current[this.current.length - 1].value = this.current[this.current.length - 1].value.slice(0, -1) + match;
				break;
			} else if(this.parser.peek() == '{') {
				var expr = this.parseCode("skipEnclosedContent", true);
				if(match == '#') {
					this.addCurrent();
					this.add(this.runtime + "." + this.transpiler.feature("mixin") + "(" + this.element + ", " + this.bind + ", " + this.anchor + ", " + expr.source + ");");
				} else {
					this.pushExpr(expr);
				}
			} else {
				this.pushText(match);
			}
			break;
		case '<':
			if(this.handle()) {
				this.addFinalCurrent();
				handle();
			} else {
				this.pushText('<');
			}
			break;
		default:
			this.addFinalCurrent();
			eof();
	}
};

TextParser.prototype.parse = function(handle, eof){
	var result = this.parser.find(['<', '$', '#'], false, true);
	this.pushText(result.pre);
	this.parseImpl(result.pre, result.match, handle, eof);
};

/**
 * @class
 * @since 0.53.0
 */
function LogicParser(transpiler, parser, source, attributes) {
	TextParser.call(this, transpiler, parser, source, attributes);
	this.count = 0;
	this.statements = [];
	this.popped = [];
}

LogicParser.prototype = Object.create(TextParser.prototype);

LogicParser.prototype.getLineText = function(){
	var last = this.current[this.current.length - 1];
	if(last.text) {
		var index = last.value.lastIndexOf('\n');
		if(index > 0) return last.value.substr(index);
		else return last.value;
	} else {
		return "";
	}
};

LogicParser.prototype.parseLogic = function(expected, type){
	var line;
	if(
		this.parser.input.substr(this.parser.index, expected.length - 1) == expected.substr(1) && // when the expected keyword is found
		!/\S/.test(line = this.getLineText()) && // and when it is at the start of line
		!/[a-zA-Z0-9_$]/.test(this.parser.input.charAt(this.parser.index + expected.length - 1)) // and when it is an exact keyword
	) {
		this.parser.index += expected.length - 1;
		var trimmed = this.trimEnd();
		this.addCurrent();
		this.add(trimmed);
		if(type === 0) {
			// variable
			var end = this.parser.find(['=', ';'], true, {comments: true, strings: false});
			this.add(expected + end.pre + end.match);
			if(end.match == '=') {
				this.add(this.transpiler.parseCode(this.parser.readExpression()).source);
				if(this.parser.readIf(';')) this.add(';');
			}
		} else {
			// statement
			var statement = Polyfill.startsWith.call(expected, "else") ? this.popped.pop() : {
				startIndex: this.source.length,
				observables: [],
				maybeObservables: [],
				end: "",
				parts: []
			};
			var part = {
				type: expected,
				declStart: this.source.length
			};
			statement.parts.push(part);
			if(type === 1) {
				var transpiler = this.transpiler;
				function reparse(source, parser) {
					var parsed = transpiler.parseCode(source, parser);
					Array.prototype.push.apply(statement.observables, parsed.observables);
					Array.prototype.push.apply(statement.maybeObservables, parsed.maybeObservables);
					return parsed.source;
				}
				// with condition
				var skipped = this.parser.skipImpl({});
				if(this.parser.peek() != '(') this.parser.error("Expected '(' after '" + expected + "'.");
				var position = this.parser.position;
				var source = reparse(this.parser.skipEnclosedContent(), this.parser);
				if(expected == "foreach") {
					var parser = new Parser(source.slice(1, -1), position);
					parser.options = {comments: true, strings: true, regexp: true};
					skipped += parser.skipImpl({comments: true, strings: false});
					var expr, from, to;
					// `from` and `to` need to be reparsed searching for observables as `from` and `to`
					// are only keywords in this specific context
					if(Polyfill.startsWith.call(parser.input.substr(parser.index), "from ")) {
						parser.index += 5;
						from = reparse(parser.readExpression());
						parser.expectSequence("to ");
						to = reparse(parser.readExpression());
					} else if(Polyfill.startsWith.call(parser.input.substr(parser.index), "to ")) {
						parser.index += 3;
						from = "0";
						to = reparse(parser.readExpression());
					} else {
						expr = parser.readExpression();
					}
					var rest = "";
					if(parser.input.substr(parser.index, 3) == "as ") {
						parser.index += 3;
						rest = parser.input.substr(parser.index);
					}
					if(expr) {
						this.add(this.runtime + "." + this.transpiler.feature("forEach") + "(this, " + expr + ", function(" + rest + ")");
						statement.end = ");";
					} else {
						this.add(this.runtime + "." + this.transpiler.feature("range") + "(this, " + from + ", " + to + ", function(" + rest + ")");
						statement.end = ");";
					}
				} else {
					this.add(expected + skipped + source);
				}
			} else {
				// without condition
				this.add(expected);
			}
			this.add(this.parser.skipImpl({}));
			if(!(statement.inline = !this.parser.readIf('{'))) this.add('{');
			part.declEnd = this.source.length;
			this.statements.push(statement);
			this.onStatementStart(statement);
		}
		return true;
	} else {
		if(line && line.slice(-1) == '\\') {
			var curr = this.current[this.current.length - 1];
			curr.value = curr.value.slice(0, -1);
		}
		return false;
	}
};

LogicParser.prototype.find = function(){
	return this.parser.find(['$', '#', '<', 'v', 'c', 'l', 'i', 'e', 'f', 'w', '}', '\n'], false, false);
};

LogicParser.prototype.parse = function(handle, eof){
	var result = this.find();
	this.pushText(result.pre);
	switch(result.match) {
		case 'c':
			if(!this.parseLogic("const", 0)) this.pushText('c');
			break;
		case 'l':
			if(!this.parseLogic("let", 0)) this.pushText('l');
			break;
		case 'v':
			if(!this.parseLogic("var", 0)) this.pushText('v');
			break;
		case 'i':
			if(!this.parseLogic("if", 1)) this.pushText('i');
			break;
		case 'e':
			if(!this.parseLogic("else if", 1) && !this.parseLogic("else", 2)) this.pushText('e');
			break;
		case 'f':
			if(!this.parseLogic("foreach", 1) && !this.parseLogic("for", 1)) this.pushText('f');
			break;
		case 'w':
			if(!this.parseLogic("while", 1)) this.pushText('w');
			break;
		case '}':
			if(result.pre.slice(-1) == '\\') {
				var curr = this.current[this.current.length - 1];
				curr.value = curr.value.slice(0, -1) + '}';
			} else if(this.statements.length) {
				var trimmed = this.trimEnd();
				this.addCurrent();
				this.add(trimmed);
				this.add('}');
				var statement = this.statements.pop();
				statement.endIndex = this.source.length;
				statement.parts[statement.parts.length - 1].close = this.source.length - 1;
				this.popped.push(statement);
				this.onStatementEnd(statement);
			} else {
				this.pushText('}');
			}
			break;
		case '\n':
			if(this.statements.length && this.statements[this.statements.length - 1].inline) {
				var trimmed = this.trimEnd();
				this.addCurrent();
				this.add(trimmed);
				this.add('\n');
				var statement = this.statements.pop();
				statement.endIndex = this.source.length;
				this.popped.push(statement);
				this.onStatementEnd(statement);
			} else {
				this.pushText('\n');
			}
			break;
		default:
			this.parseImpl(result.pre, result.match, handle, eof);
	}
};

LogicParser.prototype.onStatementStart = function(statement){};

LogicParser.prototype.onStatementEnd = function(statement){};

LogicParser.prototype.end = function(){
	for(var i=0; i<this.popped.length; i++) {
		var popped = this.popped[i];
		var bind = !!popped.observables.length || !!popped.maybeObservables.length;
		if(bind) {
			if(popped.parts[0].type == "if" && (popped.parts.length == 1 || popped.parts[1].type == "else")) {
				// special bind-if(-else)
				var partIf = popped.parts[0];
				var partElse = popped.parts[1];
				var condition = this.source[partIf.declStart].substr(2);
				// remove all declarations as they will be replaced
				var remove = function(start, end){
					for(var i=start; i<end; i++) {
						this.source[i] = "";
					}
				}.bind(this);
				remove(partIf.declStart, partIf.declEnd);
				if(partIf.close) remove(partIf.close, partIf.close + 1);
				var observable = this.transpiler.nextVarName();
				this.source[partIf.declStart] =
					// declare a new computed observable with the condition
					"var " + observable + "=" + this.runtime + "." + this.transpiler.feature("computedObservable") + "(this, " + this.bind + ", [" + uniq(popped.observables).join(", ") + "], function(){return " + condition + "}" +
					(popped.maybeObservables.length ? ", [" + uniq(popped.maybeObservables) + "]" : "") + ");" +
					// and bind to it
					this.runtime + "." + this.transpiler.feature("bindIf") + "(this, " + this.element + ", " + this.bind + ", " + this.anchor + ", [" + observable + "], 0, 0, function(){return " + observable + ".value}, " +
					"function(" + this.element + ", " + this.bind + ", " + this.anchor + "){";

				if(partElse) {
					remove(partElse.declStart, partElse.declEnd);
					if(partElse.close) remove(partElse.close, partElse.close + 1);
					this.source[partElse.declStart] = "}, function(" + this.element + ", " + this.bind + ", " + this.anchor + "){";
				}
			} else {
				// normal bind
				this.source[popped.startIndex] = this.runtime + "." + this.transpiler.feature("bind") + "(this, " + this.element + ", " + this.bind + ", " + this.anchor +
					", [" + uniq(popped.observables).join(", ") + "]" + (popped.maybeObservables.length ? ".concat(" + this.runtime + "." + this.transpiler.feature("filterObservables") + "([" + uniq(popped.maybeObservables) + "]))" : "") +
					", 0, 0, function(" + this.element + ", " + this.bind + ", " + this.anchor + "){" + this.source[popped.startIndex];
			}
			this.source[popped.endIndex] = "});" + this.source[popped.endIndex];
		}
		if(popped.end.length) {
			// prepend end if needed
			this.source[popped.endIndex] = popped.end + this.source[popped.endIndex];
		}
	}
};

/**
 * @class
 * @since 0.99.0
 */
function OptionalLogicParser(transpiler, parser, source, attributes) {
	LogicParser.call(this, transpiler, parser, source, attributes);
	if(!attributes.logic) {
		this.parse = TextParser.prototype.parse.bind(this);
	}
}

OptionalLogicParser.prototype = Object.create(LogicParser.prototype);

/**
 * @class
 * @since 0.15.0
 */
function JavascriptParser(transpiler, parser, source, attributes) {
	BreakpointParser.call(this, transpiler, parser, source, attributes, ['(', ')', '@', '*', '^']);
	this.observables = [];
	this.maybeObservables = [];
	this.parentheses = [];
}

JavascriptParser.getOptions = function(){
	return {isDefault: true, code: true, regexp: true};
};

JavascriptParser.prototype = Object.create(BreakpointParser.prototype);

JavascriptParser.prototype.handleParenthesis = function(match){
	this.add(this.parser.last = match);
	this.parser.lastIndex = this.parser.index;
};

JavascriptParser.prototype.addObservable = function(observables, maybeObservables, name){
	if(name.length) {
		var source = this.source[this.source.length - 1];
		this.source[this.source.length - 1] = source.substring(0, source.length - name.length);
	}
	var maybe = !!this.parser.readIf('?');
	var skipped = this.parser.skip();
	if(skipped) this.add(skipped);
	if(this.parser.peek() == '(') {
		name += this.parseCodeToSource("skipEnclosedContent");
	} else {
		name += this.parseCodeToSource("readVarName", true);
	}
	if(maybe) {
		this.add(this.runtime + "." + this.transpiler.feature("value") + "(" + name + ")");
		if(maybeObservables) maybeObservables.push(name);
	} else {
		this.add(name + ".value");
		if(observables) observables.push(name);
	}
	this.parser.last = ')';
	this.parser.lastIndex = this.parser.index;
};

JavascriptParser.prototype.lookBehind = function(){
	var end = this.parser.lastIndex;
	var index = end;
	while(index >= 0 && /[\s\.a-zA-Z0-9_$]/.test(this.parser.input.charAt(index))) {
		index--;
	}
	return this.parser.input.substring(index + 1, end + 1);
};

JavascriptParser.prototype.next = function(match){
	function getName() {
		var skipped = this.parser.skip();
		if(skipped) this.add(skipped);
		if(this.parser.peek() == '(') {
			return this.parseCodeToSource("skipEnclosedContent");
		} else {
			return this.parseCodeToSource("readVarName", true);
		}
	}
	switch(match) {
		case '(':
			this.parentheses.push(false);
			this.parser.parentheses.push(this.parser.lastIndex);
			this.handleParenthesis(match);
			break;
		case ')':
			var popped = this.parentheses.pop();
			if(popped) this.add(popped);
			this.parser.lastParenthesis = this.parser.parentheses.pop();
			this.handleParenthesis(match);
			break;
		case '@':
			if(this.parser.peek() == '@') {
				this.parser.index++;
				this.add((this.parser.last != '.' ? this.element + "." : "") + "__builder.widgets");
				var skipped = this.parser.skipImpl({strings: false});
				this.add(skipped);
				if(/[a-zA-Z_$]/.test(this.parser.peek())) this.add(".");
			} else {
				var skip = this.parser.skipImpl({strings: false});
				var peek = this.parser.peek();
				var fallback = function(){
					if(peek === undefined || !/[a-zA-Z0-9_]/.test(peek)) {
						this.add(this.element);
						if(skip) this.add(skip);
					} else {
						this.add('@' + skip);
					}
				}.bind(this);
				var match = this.parser.input.substr(this.parser.index).match(/^(?:((?:\.?[a-zA-Z0-9_$]+)*)(\s*)\()/);
				if(match) {
					var add = function(runtime, fun, args){
						this.parser.index += match[0].length;
						this.add((runtime ? this.runtime + "." : "") + skip + fun + match[2] + "(" + (args || ""));
						this.parentheses.push(false);
					}.bind(this);
					switch(match[1]) {
						case "subscribe":
							add(true, this.transpiler.feature("subscribe"), this.bind + ", ");
							break;
						case "watch":
						case "watch.deep":
						case "watch.deps":
						case "watch.always":
							// new observable
							var type = match[1].substr(5);
							this.parser.index += match[0].length;
							this.parser.parseTemplateLiteral = null;
							var parsed = this.transpiler.parseCode(this.parser.readExpression());
							this.transpiler.updateTemplateLiteralParser();
							if(parsed.observables && parsed.observables.length || parsed.maybeObservables && parsed.maybeObservables.length || type == ".deps") {
								// computed
								this.add(this.runtime + "." + this.transpiler.feature("computedObservable") + type + "(this, " + this.bind + ", " + parsed.toSpreadValue());
							} else {
								this.add(this.runtime + "." + this.transpiler.feature("observable") + type + "(" + parsed.source);
							}
							this.parentheses.push(false);
							break;
						case "text":
						case "html":
							this.parser.index += match[0].length - 1;
							this.add(this.runtime + "." + this.transpiler.feature(match[1]) + "(" + this.element + ", " + this.bind + ", " + this.anchor + ", " + this.parseCodeToValue("skipEnclosedContent") + ")");
							break;
						case "on":
							add(true, this.transpiler.feature("on"), "this, " + this.element + ", " + this.bind + ", ");
							break;
						case "widget":
							add(true, this.transpiler.feature("widget"));
							break;
						case "widgets.add":
							add(true, this.transpiler.feature("defineWidget"));
							break;
						case "widgets.remove":
							add(true, this.transpiler.feature("undefineWidget"));
							break;
						case "widgets.has":
							add(true, this.transpiler.feature("hasWidget"));
							break;
						case "widgets.names":
							add(true, this.transpiler.feature("getWidgetsNames"));
							break;
						case "render":
						case "":
							add(false, match[1], this.transpiler.slotsRegistry + ", " + this.element + ", " + this.bind + ", " + this.anchor + ", ");
							break;
						case "slot":
							add(false, this.transpiler.slotsRegistry + ".add", this.runtime + "." + this.transpiler.feature("createAnchor") + "(" + this.element + ", " + this.bind + ", " + this.anchor + "), ");
							break;
						case "animations.add":
							add(true, this.transpiler.feature("addAnimation"));
							break;
						case "quote":
							add(true, this.transpiler.feature("quote"));
							break;
						case "rgb":
						case "rgba":
						case "hsl":
						case "hsla":
						case "darken":
						case "lighten":
						case "saturate":
						case "desaturate":
						case "grayscale":
						case "greyscale":
						case "invert":
						case "pastel":
						case "mix":
						case "contrast":
							add(true, this.transpiler.feature("css." + match[1]));
							break;
						default:
							fallback();
					}
				} else {
					fallback();
				}
			}
			break;
		case '*':
			if(this.parser.couldStartRegExp()) {
				if(this.parser.readIf('*')) {
					// new observable
					var position = this.parser.position;
					this.parser.parseTemplateLiteral = null;
					var parsed = this.transpiler.parseCode(this.parser.readSingleExpression(true));
					this.transpiler.updateTemplateLiteralParser();
					if(parsed.observables && parsed.observables.length || parsed.maybeObservables && parsed.maybeObservables.length) {
						// should be computed
						this.transpiler.warn("The observable syntax `**` cannot be used to create computed observables, use `@watch` instead.", position);
					}
					this.add(this.runtime + "." + this.transpiler.feature("observable") + "(" + parsed.source + ")");
					this.parser.last = ')';
					this.parser.lastIndex = this.parser.index;
				} else {
					// get/set observable
					this.addObservable(this.observables, this.maybeObservables, "");
				}
			} else if(this.parser.last == '.') {
				this.addObservable(this.observables, this.maybeObservables, this.lookBehind());
			} else {
				// just a multiplication or exponentiation
				this.add('*');
				if(this.parser.peek() == '*') this.add(this.parser.read()); // exponentiation, skip to avoid trying to trat it as observable
				this.parser.last = '*';
			}
			break;
		case '^':
			if(this.parser.couldStartRegExp()) {
				this.addObservable(null, null, "");
			} else if(this.parser.last == '.') {
				this.addObservable(null, null, this.lookBehind());
			} else {
				// xor operator
				this.add('^');
				this.parser.last = '^';
			}
			break;
	}
};

/**
 * @class
 * @since 0.15.0
 */
function HTMLParser(transpiler, parser, source, attributes) {
	OptionalLogicParser.call(this, transpiler, parser, source, attributes);
}

HTMLParser.getOptions = function(){
	return {comments: false, strings: false};
};

HTMLParser.prototype = Object.create(OptionalLogicParser.prototype);

HTMLParser.prototype.replaceText = Text.replaceEntities || (function(){
	var converter;
	return function(data){
		if(!converter) converter = document.createElement("textarea");
		converter.innerHTML = data;
		return converter.value;
	}
})();

/**
 * @class
 * @since 0.37.0
 */
function ScriptParser(transpiler, parser, source, attributes) {
	TextParser.call(this, transpiler, parser, source, attributes);
}

ScriptParser.getOptions = function(){
	return {comments: false, strings: false, children: false, tags: ["script"]};
};

ScriptParser.prototype = Object.create(TextParser.prototype);

ScriptParser.prototype.handle = function(){
	return !!/^\/#?script>/.exec(this.parser.input.substr(this.parser.index));
};

/**
 * @class
 * @since 0.15.0
 */
function CSSParser(transpiler, parser, source, attributes) {
	OptionalLogicParser.call(this, transpiler, parser, source, attributes);
}

CSSParser.getOptions = function(){
	return {comments: true, inlineComments: false, strings: true, children: false};
};

CSSParser.prototype = Object.create(OptionalLogicParser.prototype);

/**
 * @class
 * @since 0.99.0
 */
function SSBParser(transpiler, parser, source, attributes) {
	LogicParser.call(this, transpiler, parser, source, attributes);
	this.observables = [];
	this.maybeObservables = [];
	this.expr = [];
	this.scopes = [transpiler.nextVarName()];
	this.scope = attributes.scope;
	this.scoped = !!attributes.scoped;
	this.inExpr = false;
}

SSBParser.getOptions = function(){
	return {strings: true, children: false, tags: ["style"]};
};

SSBParser.prototype = Object.create(LogicParser.prototype);

SSBParser.prototype.addScope = function(selector){
	var scope = this.transpiler.nextVarName();
	this.add("var " + scope + "=" + this.runtime + "." + this.transpiler.feature("select") + "(" + this.scopes[this.scopes.length - 1] + ", " + selector + ");");
	this.scopes.push(scope);
};

SSBParser.prototype.removeScope = function(){
	this.scopes.pop();
};

SSBParser.prototype.skip = function(){
	var skipped = this.parser.skip();
	if(skipped) this.add(skipped);
};

SSBParser.prototype.start = function(){
	this.add(this.runtime + "." + this.transpiler.feature("compileAndBindStyle") + "(function(){");
	this.add("var " + this.scopes[0] + "=" + this.runtime + "." + this.transpiler.feature("root") + "();");
	if(this.scoped) this.addScope("'.' + " + this.runtime + ".config.prefix + " + this.element + ".__builder.runtimeId");
	else if(this.scope) this.addScope(JSON.stringify('.' + this.scope));
};

SSBParser.prototype.find = function(){
	return this.parser.find(['$', '<', 'v', 'c', 'l', 'i', 'e', 'f', 'w', '{', '}', ';'], false, false);
};

SSBParser.prototype.lastValue = function(callback, parser){
	var end;
	if(this.current.length) {
		if(this.current[0].text) {
			// trim start
			var value = this.current[0].value;
			var trimmed = Polyfill.trimStart.call(value);
			this.add(value.substring(0, value.length - trimmed.length));
			this.current[0].value = trimmed;
		}
		if(this.current[this.current.length - 1].text) {
			// trim end
			var value = this.current[this.current.length - 1].value;
			var trimmed = Polyfill.trimEnd.call(value);
			end = value.substr(trimmed.length);
			this.current[this.current.length - 1].value = trimmed;
		}
	}
	callback.call(this, this.current.filter(function(part){
		return !part.text || part.value.length;
	}).map(function(part){
		if(part.text) {
			return stringify(part.value);
		} else {
			Array.prototype.push.apply(this.observables, part.value.observables);
			Array.prototype.push.apply(this.maybeObservables, part.value.maybeObservables);
			return parser ? parser(part.value.source) : '(' + part.value.source + ')';
		}
	}.bind(this)).join(" + "));
	if(end) this.add(end);
	this.current = [];
};

SSBParser.prototype.parseImpl = function(pre, match, handle, eof){
	switch(match) {
		case '{':
			this.lastValue(function(value){
				this.addScope(value);
			});
			this.statements.push({
				selector: true,
				observables: [],
				maybeObservables: [],
				end: "",
				parts: [{}]
			});
			this.inExpr = false;
			break;
		case ';':
			var scope = this.scopes[this.scopes.length - 1];
			var value;
			for(var i=0; i<this.current.length; i++) {
				var current = this.current[i];
				if(current.text) {
					var column = current.value.indexOf(':');
					if(column != -1) {
						var transpiler = this.transpiler;
						var value = this.current.slice(i + 1);
						value.unshift({text: true, value: current.value.substr(column + 1)});
						current.value = current.value.substring(0, column);
						this.current = this.current.slice(0, i + 1);
						this.lastValue(function(value){
							this.add(scope + ".value(" + value);
						});
						this.add(",");
						this.current = value;
						this.lastValue(function(value){
							this.add(value + ");");
						}, function(value){
							console.log(value);
							return SSBParser.createExpr(value, transpiler);
						});
						break;
					}
				}
			}
			if(!value) {
				this.lastValue(function(value){
					this.add(scope + ".stat(" + value + ");");
				});
			}
			this.inExpr = false;
			break;
		default:
			TextParser.prototype.parseImpl.call(this, pre, match, handle, eof);
	}
};

SSBParser.prototype.parse = function(handle, eof){
	if(!this.inExpr) {
		this.add(this.parser.skip());
		this.inExpr = true;
	}
	LogicParser.prototype.parse.call(this, handle, eof);
};

SSBParser.prototype.onStatementStart = function(statement){
	this.inExpr = false;
};

SSBParser.prototype.onStatementEnd = function(statement){
	if(statement.selector) this.removeScope();
	this.inExpr = false;
};

SSBParser.prototype.addFinalCurrent = function(){
	// add remaining spaces at end
	while(this.current.length) {
		this.add(this.current.shift().value);
	}
};

SSBParser.prototype.end = function(){
	// replace unneeded closing braces and add statement.end needed for foreach
	this.popped.forEach(function(popped){
		if(popped.selector) {
			this.source[popped.endIndex - 1] = "";
		} else if(popped.end.length) {
			this.source[popped.endIndex] = popped.end + this.source[popped.endIndex];
		}
	}.bind(this));
	// add return statement
	this.add("return " + this.scopes[0] + ".content}, " + this.element + ", " + this.bind + ", [" + uniq(this.observables).join(", ") + "], [" + this.maybeObservables.join(", ") + "])");
};

SSBParser.prototype.actionImpl = function(type){
	if(this.scoped) return "function(){ this.parentNode.__builder." + type + "Class(" + this.runtime + ".config.prefix + this.__builder.runtimeId); }";
};

SSBParser.prototype.afterappend = function(){
	return this.actionImpl("add");
};

SSBParser.prototype.beforeremove = function(){
	return this.actionImpl("remove");
};

SSBParser.createExprImpl = function(expr, info, transpiler){
	var parser = new Parser(expr);
	parser.options = {comments: true, strings: true};
	function skip() {
		var skipped = parser.skipImpl({strings: false, comments: true});
		if(skipped) info.computed += skipped;
	}
	function readSign() {
		var result = parser.readImpl(/^[+-]{1,2}/, false);
		if(result) {
			info.computed += result;
			info.op++;
		}
	}
	function readOp() {
		var result = parser.readImpl(/^[+*\/%-]/, false);
		if(result) {
			info.computed += result;
			info.op++;
			return true;
		}
	}
	while(!parser.eof()) {
		skip();
		readSign();
		if(parser.peek() == '(') {
			info.computed += '(';
			var start = parser.index + 1;
			if(!SSBParser.createExprImpl(parser.skipEnclosedContent().slice(1, -1), info, transpiler)) return false;
			info.computed += ')';
		} else {
			var v = parser.readSingleExpression(true);
			if(/^[a-zA-Z_$]/.exec(v)) {
				// it's a variable
				info.is = true;
				info.computed += info.runtime + "." + transpiler.feature("unit") + "(" + info.param + "," + v + ")";
			} else {
				info.computed += v;
			}
		}
		readSign();
		skip();
		var op = readOp();
		skip();
		if(!op && !parser.eof()) return false;
	}
	return true;
};

SSBParser.createExpr = function(expr, transpiler){
	var param = transpiler.nextVarName();
	var info = {
		runtime: transpiler.runtime,
		param: param,
		computed: "(function(" + param + "){return " + transpiler.runtime + "." + transpiler.feature("computeUnit") + "(" + param + ",",
		is: false,
		op: 0
	};
	return SSBParser.createExprImpl(expr, info, transpiler) && info.is && info.op && (info.computed + ")})({})") || ("(" + expr + ")");
};

// export parsers

Transpiler.Internal = {
	Parser: Parser,
	SourceParser: SourceParser,
	BreakpointParser: BreakpointParser,
	TextParser: TextParser,
	LogicParser: LogicParser,
	JavascriptParser: JavascriptParser,
	HTMLParser: HTMLParser,
	ScriptParser: ScriptParser,
	CSSParser: CSSParser,
	SSBParser: SSBParser
};

// register default modes

Transpiler.defineMode(["code", "javascript", "js"], JavascriptParser, true);
Transpiler.defineMode(["html"], HTMLParser);
Transpiler.defineMode(["script"], ScriptParser);
Transpiler.defineMode(["css"], CSSParser);
Transpiler.defineMode(["ssb", "style"], SSBParser);

function Transpiler(options) {
	this.options = options || {};
}

/**
 * @since 0.49.0
 */
Transpiler.prototype.nextId = function(){
	return this.count++;
};

/**
 * @since 0.78.0
 */
Transpiler.prototype.nextVarName = function(){
	var num = this.count++ % 1521;
	var s = "";
	while(num > 0) {
		var t = (num - 1) % 39;
		s = String.fromCharCode(0x561 + t) + s;
		num = Math.floor((num - t) / 39);
	}
	return s;
};

/**
 * @since 0.16.0
 */
Transpiler.prototype.startMode = function(mode, attributes){
	var currentParser = Transpiler.startMode(mode, this, this.parser, this.source, attributes);
	this.currentMode = {
		name: modeRegistry[mode].name,
		parser: currentParser,
		options: currentParser.options
	};
	this.modes.push(this.currentMode);
	return currentParser;
};

/**
 * @since 0.16.0
 */
Transpiler.prototype.endMode = function(){
	var ret = this.modes.pop().parser;
	ret.end();
	this.currentMode = this.modes[this.modes.length - 1];
	if(this.currentMode) this.parser.options = this.currentMode.options;
	return ret;
};

/**
 * @since 0.42.0
 */
Transpiler.prototype.parseCode = function(input, parentParser){
	var parser = new Parser(input, (parentParser || this.parser).position);
	var source = [];
	var mode = Transpiler.startMode(defaultMode, this, parser, source);
	if(mode.observables) {
		var $this = this;
		parser.parseTemplateLiteral = function(expr){
			var parsed = $this.parseCode(expr, parser);
			Array.prototype.push.apply(mode.observables, parsed.observables);
			Array.prototype.push.apply(mode.maybeObservables, parsed.maybeObservables);
			return parsed.source;
		};
	}
	mode.start();
	while(parser.index < input.length) {
		mode.parse(function(){ source.push('<'); }, function(){});
	}
	mode.end();
	source = source.join("");
	var observables = mode.observables ? uniq(mode.observables) : [];
	var maybeObservables = mode.maybeObservables ? uniq(mode.maybeObservables) : [];
	var $this = this;
	var ret = {
		source: source,
		observables: observables,
		maybeObservables: maybeObservables,
		toValue: function(){
			if(observables.length || maybeObservables.length) {
				if(observables.length == 1 && input.charAt(0) == '*' && source == input.substr(1) + ".value") {
					// single observable, pass it raw so it can be used in two-way binding
					return input.substr(1);
				} else {
					return $this.runtime + "." + $this.feature(maybeObservables.length ? "maybeComputedObservable" : "computedObservable") + "(this, " + $this.bind + ", " + ret.toSpreadValue() + ")";
				}
			} else {
				return source;
			}
		},
		toSpreadValue: function(){
			return "[" + observables.join(", ") + "], function(){return " + source + "}, [" + maybeObservables.join(", ") + "]";
		}
	};
	return ret;
};

/**
 * @since 0.51.0
 */
Transpiler.prototype.parseTemplateLiteral = function(expr, parser){
	return this.parseCode(expr, parser).source;
};

/**
 * Sets the parser's template literal parser to @{link parseTemplateLiteral}.
 * @since 0.51.0
 */
Transpiler.prototype.updateTemplateLiteralParser = function(){
	this.parser.parseTemplateLiteral = this.parseTemplateLiteral.bind(this);
};

/**
 * @since 0.46.0
 */
Transpiler.prototype.wrapFunction = function(value, ret){
	if(value.charAt(0) == '{' && value.charAt(value.length - 1) == '}') {
		return "function(" + Array.prototype.slice.call(arguments, 2).join(", ") + "){" + (ret ? "return " : "") + value.substring(1, value.length - 1) + "}";
	} else {
		return value;
	}
};
	
/**
 * Inserts a semicolon after a tag creation if needed.
 * @since 0.22.0
 */
Transpiler.prototype.addSemicolon = function(){
	if(this.currentMode.options.code) {
		var skip = this.parser.skip();
		var peek = this.parser.peek();
		if(peek != ';' && peek != ':' && peek != ',' && peek != '.' && peek != ')' && peek != ']' && peek != '}' && peek != '&' && peek != '|') this.source.push(";");
		if(skip) this.source.push(skip);
	} else {
		this.source.push(";");
	}
};

/**
 * Closes a scope and optionally ends the current mode and restores the
 * previous one.
 * @since 0.29.0
 */
Transpiler.prototype.close = function(tagName){
	var closeCode = !this.parser.eof();
	if(tagName !== undefined) {
		// closing a tag, not called as EOF
		var closeInfo = this.tags.pop();
		if(closeInfo.tagName && closeInfo.tagName != tagName) {
			this.warn("Tag `" + closeInfo.tagName + "` is not closed properly (used `</" + tagName + ">` instead of `</" + closeInfo.tagName + ">`).", closeInfo.position);
		}
		if(closeInfo.mode) this.endMode();
		this.inheritance.pop();
		this.level--;
	}
	if(this.closing.length) {
		this.source.push(this.closing.pop());
		this.addSemicolon();
	}
};

/**
 * @since 0.29.0
 */
Transpiler.prototype.open = function(){
	if(this.parser.peek() == '/') {
		this.parser.index++;
		var result = this.parser.find(['>'], true, false); // skip until closed
		this.close(result.pre);
	} else if(this.parser.peek() == '!') {
		this.parser.index++;
		var rest = this.parser.input.substr(this.parser.index);
		if(Polyfill.startsWith.call(rest, "COMMENT ")) {
			this.parser.index += 8;
			this.source.push("/*" + this.parser.findSequence(">", true).slice(0, -1) + "*/");
		} else {
			var types = ["runtime", "element", "bind", "anchor"];
			var match = false;
			for(var i in types) {
				if(Polyfill.startsWith.call(rest, types[i].toUpperCase() + '>')) {
					this.parser.index += types[i].length + 1;
					this.source.push(this[types[i]]);
					this.addSemicolon();
					match = true;
					break;
				}
			}
			if(!match) {
				this.parser.expect('-');
				this.parser.expect('-');
				this.source.push(this.runtime + "." + this.feature("comment") + "(" + this.element + ", " + this.bind + ", " + this.anchor + ", " + stringify(this.parser.findSequence("-->", true).slice(0, -3)) + ")");
				this.addSemicolon();
			}
		}
	} else if(this.currentMode.options.children === false && this.parser.peek() != '#') {
		throw new Error("Mode " + this.currentMode.name + " cannot have children");
	} else {
		var position = this.parser.position;
		var parser = this.parser;
		var skipped = "", requiredSkip;
		function skip(required) {
			var s = parser.skipImpl({comments: true, strings: false}); // before/after attributes
			skipped += s;
			if(required) requiredSkip = s;
		}
		var currentIndex = this.source.length;

		var create = true; // whether a new element is being created
		var update = true; // whether the element is being updated, only considered if create is false
		var append = true; // whether the element should be appended to the current element after its creation
		var unique = false; // whether the new element should be appended always or only when its not already on the DOM
		var parent = this.element; // element that the new element will be appended to, if not null
		var updatedElement; // element that will be updated when optional
		var element = this.element; // element that will be updated
		var queryElement;
		var iattributes = {}; // attributes used to give instructions to the transpiler, not used at runtime
		var rattributes = []; // attributes used at runtime to modify the element
		var sattributes = []; // variable name of the attributes passed using the spread syntax
		var newMode = undefined;
		var currentNamespace = null;
		var currentInheritance = null;
		var currentClosing = [];
		var createAnchor;
		var transitions = [];
		var forms = [];
		var computed = false;
		var optional = false;
		var selector, originalTagName, tagName = "";
		var selectorAll = false;
		var slotName;
		this.updateTemplateLiteralParser();
		if(selector = this.parser.readQueryExpr()) {
			selector = this.parseCode(selector).source;
			selectorAll = !!this.parser.readIf('+');
			if(this.parser.readIf('*')) {
				queryElement = "document";
				if(!selectorAll) selectorAll = !!this.parser.readIf('+');
			}
			create = append = false;
		} else {
			optional = !!this.parser.readIf('?');
			if(tagName = this.parser.readComputedExpr()) {
				tagName = this.parseCode(tagName).source;
				computed = true;
			} else {
				originalTagName = tagName = this.parser.readTagName(true);
				var column = tagName.indexOf(':');
				if(column > 0) {
					slotName = tagName.substr(column + 1);
					tagName = tagName.substring(0, column);
					create = append = false;
				}
			}
		}
		skip(true);
		var next = false;
		while(!this.parser.eof() && (next = this.parser.peek()) != '>' && next != '/') {
			if(!/[\n\t ]/.test(requiredSkip)) this.parser.error("Space is required between attribute names.");
			this.updateTemplateLiteralParser();
			if(next == '.') {
				this.parser.index++;
				this.parser.expect('.');
				this.parser.expect('.');
				var expr = this.parser.readSingleExpression(false);
				if(!expr) this.parser.error("Could not find a valid expression.");
				sattributes.push(expr);
				skip(true);
			} else {
				var add = false;
				var value = "\"\"";
				var attrs = [this.parseAttributeName(true, false)];
				if(this.parser.readIf('{')) {
					var newAttrs = [];
					do {
						skip();
						for(var i in attrs) {
							newAttrs.push(this.parseAttributeName(true, true, attrs[i]));
						}
						skip();
					} while((next = this.parser.read()) == ',');
					if(next != '}') this.parser.error("Expected '}' after interpolated attributes list.");
					attrs = newAttrs;
					var afterAttr = this.parseAttributeName(false, false);
					if(afterAttr.parts.length) {
						attrs.forEach(function(attr){
							if(afterAttr.computed) attr.computed = true;
							afterAttr.parts.forEach(function(part){
								attr.parts.push(Polyfill.assign({}, part));
							});
						});
					}
				}
				// convert attribute names and prefixes
				for(var i in attrs) {
					var attr = attrs[i];
					if(attr.prefix === false) attr.prefix = "";
					this.compileAttributeParts(attr);
				}
				// read value
				skip(true);
				if(this.parser.peek() == '=') {
					this.parser.index++;
					skip();
					this.parser.parseTemplateLiteral = null;
					var prefix = attrs[0].prefix;
					for(var i=1; i<attrs.length; i++) {
						if(attrs[i].prefix != prefix) {
							prefix = null;
							break;
						}
					}
					var computable = attrs.every(function(a){ return a.prefix != '+' && a.prefix != '-'; });
					var name = attrs.length == 1 ? attrs[0].name : "";
					value = this.parser.readAttributeValue();
					if(value.charAt(0) == '#') value = this.runtime + ".functions." + value.substr(1) + "()";
					if(attrs.every(function(a){ return a.prefix == '@' || a.prefix == '+'; })) {
						value = this.wrapFunction(value, false, "event");
					} else if(attrs.length == 1 && attrs[0].prefix == ':') {
						if(name == "change") {
							value = this.wrapFunction(value, true, "oldValue", "newValue");
						} else if(name == "condition" || name == "if") {
							value = this.wrapFunction(value, true);
						} else if(name == "cleanup") {
							value = this.wrapFunction(value, false);
						}
					}
					var parsed = this.parseCode(value);
					value = computable ? parsed.toValue() : parsed.source;
					skip(true);
				}
				for(var i in attrs) {
					var attr = attrs[i];
					attr.value = value;
					switch(attr.prefix) {
						case '#':
							if(attr.computed) this.parser.error("Mode attributes cannot be computed.");
							newMode = modeNames[attr.name];
							break;
						case ':':
							if(attr.computed) this.parser.error("Compile-time attributes cannot be computed.");
							if(iattributes.hasOwnProperty(attr.name)) {
								if(iattributes[attr.name] instanceof Array) {
									iattributes[attr.name].push(value);
								} else {
									var a = iattributes[attr.name] = [iattributes[attr.name], value];
									a.toString = function(){
										return '[' + this.join(", ") + ']';
									};
								}
							} else {
								iattributes[attr.name] = value;
							}
							break;
						case '*':
							var add = false;
							var temp;
							var start = attr.parts[0];
							if(!start || start.computed) this.parser.error("First part of semi compile-time attributes cannot be computed.");
							var column = start.name.indexOf(":");
							if(column == -1) column = start.name.length;
							var name = start.name.substring(0, column);
							switch(name) {
								case "next":
									temp = true;
								case "prev":
									attr.prefix = "";
									if(start.name.length == 5) attr.parts.shift();
									else start.name = start.name.substr(5);
									attr.value = this.runtime + "." + this.feature((temp ? "next" : "prev") + "Id") + "()";
									if(value != "\"\"") attr.value = value + " + " + attr.value;
									add = true;
									break;
								case "io":
								case "in":
								case "out":
									var type = start.name.substring(0, column);
									start.name = start.name.substr(column + 1);
									if(!start.name.length) attr.parts.shift();
									this.compileAttributeParts(attr);
									transitions.push({type: type, name: this.stringifyAttribute(attr), value: attr.value})
									break;
								case "number":
									start.name += ":number";
								case "checkbox":
								case "color":
								case "date":
								case "email":
								case "file":
								case "hidden":
								case "password":
								case "radio":
								case "range":
								case "text":
								case "time":
									rattributes.push({prefix: "", name: "type", value: '"' + name + '"'});
								case "form":
								case "value":
									if(column == start.name.length - 1) attr.parts.shift();
									else start.name = start.name.substr(column);
									this.compileAttributeParts(attr);
									forms.push([this.stringifyAttribute(attr), attr.value]);
									break;
								default:
									this.parser.error("Unknown semi compile-time attribute '" + name + "'.");
							}
							if(add) this.compileAttributeParts(attr);
							else break;
						default:
							rattributes.push(attr);
					}
				}
			}
			next = false;
		}
		if(!next) this.parser.errorAt(position, "Tag was not closed.");
		parser.index++;

		if(iattributes.namespace) currentNamespace = iattributes.namespace;

		var options = (function(){
			var level = ++this.level;
			var ret = {};
			var inheritance = {};
			this.inheritance.filter(function(info){
				return info && ((!info.level || info.level.indexOf(level) != -1) && (!info.whitelist || info.whitelist.indexOf(tagName) != -1));
			}).forEach(function(info){
				for(var key in info.data) {
					inheritance[key] = (inheritance[key] || []).concat(info.data[key]);
				}
			});
			var args = !!(inheritance.args || rattributes.length);
			if(computed) ret.widget = false;
			if(iattributes.namespace) ret.namespace = iattributes.namespace;
			else if(!computed && (tagName == "svg" || tagName == "mathml")) ret.namespace = '"' + tagName + '"';
			if(args) {
				ret.args = rattributes.map(function(attribute){
					return this.runtime + "." + this.feature("attr") + "(" +
						{'': 1, '@': 2, '+': 3, '-': 4, '~': 5, '$': 6, '$$': 7}[attribute.prefix] + ", " +
						(attribute.computed ? attribute.name : '"' + (attribute.name || "") + '"') +
						(attribute.value != "\"\"" || attribute.optional ? ", " + attribute.value : "") +
						(attribute.optional ? ", 1" : "") + ")";
				}.bind(this)).join(", ");
			}
			if(sattributes.length) ret.spread = sattributes.join(", ");
			if(transitions.length) {
				ret.transitions = transitions.map(function(transition){
					return "[\"" + transition.type + "\", " + transition.name + ", " + (transition.value == "\"\"" ? "{}" : transition.value) + "]";
				}).join(", ");
			}
			Object.defineProperty(ret, "toString", {
				enumerable: false,
				value: function(){
					var str = [];
					["widget", "namespace"].forEach(function(type){
						if(ret.hasOwnProperty(type)) {
							str.push(type + ":" + ret[type]);
						} else {
							var ivalue = inheritance[type];
							if(ivalue) str.push(type + ":" + ivalue[ivalue.length - 1]);
						}
					});
					["args", "spread", "transitions"].forEach(function(type){
						var ivalue = inheritance[type];
						var rvalue = ret[type];
						if(ivalue || rvalue) {
							str.push(type + ":[" + (ivalue || []).concat(rvalue || []).join(", ") + "]");
						}
					});
					return "{" + str.join(", ") + "}";
				}
			});
			return ret;
		}).call(this);

		if(iattributes.root) parent = parent + ".getRootNode({composed: " + (iattributes.composed || "false") + "})";
		else if(iattributes.head) parent = "document.head";
		else if(iattributes.body) parent = "document.body";
		else if(iattributes.parent) parent = iattributes.parent;

		if(parent == "\"\"" || iattributes.orphan) {
			// an empty string and null have the same behaviour but null is faster as it avoids the query selector controls when appending
			parent = "null";
			append = false;
		}

		if(!computed) {
			if(tagName.charAt(0) == ':') {
				var name = tagName.substr(1);
				if(this.options.aliases && this.options.aliases.hasOwnProperty(name)) {
					var alias = this.options.aliases[name];
					tagName = alias.tagName;
					if(alias.hasOwnProperty("parent")) parent = alias.parent;
					if(alias.hasOwnProperty("element")) element = alias.element;
					if(alias.hasOwnProperty("create")) create = alias.create;
					if(alias.hasOwnProperty("update")) update = alias.update;
					if(alias.hasOwnProperty("append")) append = alias.append;
					if(alias.hasOwnProperty("mode")) newMode = alias.mode;
				} else {
					switch(name) {
						case "root":
							element = element + ".getRootNode({composed: " + (iattributes.composed || "false") + "})";
							create = append = false;
							break;
						case "html":
							element = "document.documentElement";
							create = append = false;
							break;
						case "head":
						case "body":
							element = "document." + name;
							create = append = false;
							break;
						case "fragment":
							updatedElement = element;
							element = "document.createDocumentFragment()";
							create = false;
							break;
						case "shadow":
							element = parent + ".attachShadow({mode: " + (iattributes.mode || "\"open\"") + "})";
							create = update = append = false;
							break;
						case "anchor":
							tagName = ":bind";
							iattributes.to = "[]";
							create = update = append = false;
							break;
						case "inherit":
							var c = currentInheritance = {data: options};
							if(iattributes.level || iattributes.depth) {
								if(!iattributes.level) c.level = [1];
								else if(iattributes.level instanceof Array) c.level = iattributes.level.map(function(a){ return parseInt(a); });
								else c.level = [parseInt(iattributes.level)];
								if(iattributes.depth) {
									var depth = parseInt(iattributes.depth);
									if(isNaN(depth)) this.parser.error("Depth is not a valid number.");
									var levels = [];
									for(var i=0; i<depth; i++) {
										c.level.forEach(function(level){
											levels.push(level + i);
										});
									}
									c.level = levels;
								}
								for(var i=0; i<c.level.length; i++) {
									c.level[i] += this.level;
								}
							}
							if(iattributes.whitelist) {
								c.whitelist = iattributes.whitelist instanceof Array ? iattributes.whitelist : [iattributes.whitelist];
								c.whitelist = c.whitelist.map(function(a){
									return JSON.parse(a);
								});
							}
							create = update = append = false;
							break;
						case "scope":
						case "bind":
						case "bind-if":
						case "bind-each":
						default:
							create = update = append = false;
					}
				}
			} else if(tagName.charAt(0) == '#') {
				newMode = modeNames[tagName.substr(1)];
				if(newMode !== undefined) create = update = append = false; // behave as a scope
			} else if(tagName == '@') {
				create = append = false;
			} else if(tagName) {
				if(this.tagNames.hasOwnProperty(tagName)) this.tagNames[tagName]++;
				else this.tagNames[tagName] = 1;
			}
		}
		
		if(!currentInheritance && options.namespace) {
			// force inheritance to be triggered if not defined by the :inherit tag
			currentInheritance = {data: {namespace: options.namespace}};
		}

		if(newMode === undefined) {
			for(var i=0; i<modeRegistry.length; i++) {
				var info = modeRegistry[i];
				var tags = info.parser.getOptions().tags;
				if(tags && tags.indexOf(tagName) != -1) {
					newMode = i;
					break;
				}
			}
		}

		if(newMode !== undefined) {
			// every attribute is parsed as JSON, expect an empty string (default value) which is converter to true
			var attributes = {};
			for(var key in iattributes) {
				try {
					var value = JSON.parse(iattributes[key]);
					attributes[key] = value === "" ? true : value;
				} catch(e) {
					// invalid values are ignored
				}
			}
			this.startMode(newMode, attributes);
		}

		if(tagName.charAt(0) != '#') {

			if(!computed && tagName == ":debug" || iattributes["debug"]) {
				this.source.push("if(" + this.runtime + ".debug){");
				currentClosing.unshift("}");
			}

			if(iattributes.ref) {
				this.source.push(iattributes.ref + " = ");
			}

			if(selector) {
				if(iattributes["query-head"]) queryElement = "document.head";
				else if(iattributes["query-body"]) queryElement = "document.body";
				this.source.push(this.runtime + "." + this.feature("query") + "(this, " + (iattributes.query || queryElement || parent) + ", " + parent + ", " + selector + ", " + selectorAll + ", function(" + this.element + ", " + this.parentElement + "){");
				if(iattributes.adopt || iattributes.clone) {
					parent = this.parentElement;
					create = false;
					update = append = true;
				}
				currentClosing.unshift("})");
			}
			if(iattributes.unique) {
				this.source.push(this.runtime + "." + this.feature("unique") + "(this, " + this.nextId() + ", function(){return ");
				currentClosing.unshift("})");
			}

			var before = [], after = [];
			var beforeClosing = "";
			var call = true;
			var inline = false;

			var bindType = "";
			if(tagName == ":bind-if") bindType = "If";
			else if(tagName == ":bind-each") bindType = "Each";
			else if(iattributes["if"]) {
				bindType = "If";
				iattributes.condition = iattributes["if"];
			} else if(iattributes.each) {
				bindType = "Each";
				iattributes.to = iattributes.each;
			}
			if(bindType || tagName == ":bind") {
				this.source.push(this.runtime + "." + this.feature("bind" + bindType) + "(" + ["this", parent, this.bind, this.anchor, iattributes.to || "0", iattributes.change || "0", iattributes.cleanup || "0"].join(", ") +
					(bindType == "If" ? ", " + iattributes.condition : "") + ", function(" + [this.element, this.bind, this.anchor, iattributes.as || this.value, iattributes.index || this.index, iattributes.array || this.array].join(", ") + "){");
				currentClosing.unshift("})");
			}

			// before
			if(slotName) {
				before.push([this.feature("updateSlot"), options, this.slots, '"' + tagName + '"', '"' + slotName + '"', "function(" + this.element + ", " + this.anchor + "){"]);
				call = append = false;
				beforeClosing += "}";
			} else if(iattributes.clone) {
				before.push([this.feature("clone"), options]);
			} else if(optional) {
				before.push([this.feature("createOrUpdate"), element, computed ? tagName : '"' + tagName + '"', options]);
			} else if(create) {
				before.push([this.feature("create"), computed ? tagName : '"' + tagName + '"', options]);
			} else if(update) {
				var optString = options.toString();
				if(optString.length > 2) {
					// only trigger update if needed
					before.push([this.feature("update"), optString]);
				}
			}
			if(iattributes.clear) {
				before.push([this.feature("clear")]);
			}

			// after
			if(forms.length) {
				after.push([this.feature("forms"), forms.map(function(value){ return "[" + value.join(", ") + "]"; }).join(", ")]);
			}
			if(append) {
				var append = [this.feature("append"), parent, this.anchor].concat(newMode !== undefined ? [this.currentMode.parser.afterappend() || 0, this.currentMode.parser.beforeremove() || 0] : []);
				if(optional) append[0] = "[" + (updatedElement || element) + " ? \"" + this.feature("noop") + "\" : \"append\"]";
				after.push(append);
			}

			if(next == '/') {
				this.parser.expect('>');
				inline = true;
				call = false;
			}
			if(before && (call || iattributes.slot)) {
				// create body
				before.push([this.feature("body"), this.slots, "function(" + this.element + ", " + this.anchor + ", " + this.slots + "){"]);
				beforeClosing += "}";
			}

			var runtime = this.runtime;
			function mapNext(a) {
				return ", [" + runtime + (a[0].charAt(0) != "[" ? "." : "") + a.join(", ") + "]";
			}

			if(before.length || after.length) {
				this.source.push(this.runtime + "(this, " + element + ", " + this.bind + ", " + this.anchor + before.map(mapNext).join("").slice(0, -1));
				currentClosing.unshift((before.length ? "]" : "") + after.map(mapNext).join("") + ")");
			} else {
				this.source.push(parent);
			}

			currentClosing.unshift(beforeClosing);

		}

		if(iattributes.slot) {
			var add = function(slot){
				this.source.push(this.slotsRegistry + ".add(null, " + slot + ", " + this.element + ");");
			}.bind(this);
			if(iattributes.slot instanceof Array) {
				iattributes.slot.forEach(add);
			} else {
				add(iattributes.slot);
			}
		}

		currentClosing = currentClosing.join("");

		if(inline) {
			if(newMode !== undefined) {
				this.endMode();
			}
			this.source.push(currentClosing);
			this.addSemicolon();
			this.level--;
		} else {
			this.inheritance.push(currentInheritance);
			this.closing.push(currentClosing);
			this.tags.push({
				tagName: originalTagName,
				position: position,
				mode: newMode !== undefined
			});
			if(newMode !== undefined) {
				this.currentMode.parser.start();
			}
		}
	}
	this.parser.last = undefined;
};

/**
 * @since 0.60.0
 */
Transpiler.prototype.parseAttributeName = function(prefixes, req, from){
	var attr;
	if(from) {
		attr = Polyfill.assign({}, from);
		attr.parts = [];
		from.parts.forEach(function(part){
			attr.parts.push(Polyfill.assign({}, part));
		});
	} else {
		attr = {
			prefix: false,
			computed: false,
			parts: []
		};
	}
	if(prefixes) {
		if(this.parser.readIf('?')) attr.optional = true;
		var prefix = this.parser.readAttributePrefix();
		if(prefix !== false) attr.prefix = prefix;
		if(attr.prefix == ':' && attr.optional) this.parser.error("Compile-time attributes cannot be optional.");
		if(attr.prefix == '#' && attr.optional) this.parser.error("Mode attributes cannot be optional.");
	}
	var required = req && attr.prefix != '$';
	while(true) {
		var ret = {};
		if(ret.name = this.parser.readComputedExpr()) {
			attr.computed = ret.computed = true;
			if(ret.name.charAt(0) == '[' && ret.name.charAt(ret.name.length - 1) == ']') {
				ret.name = ret.name.slice(1, -1);
				ret.name = this.runtime + ".config.shortcut" + (ret.name.charAt(0) == '[' ? "" : ".") + ret.name;
			} else {
				ret.name = this.parseCode(ret.name).source;
			}
		} else if(!(ret.name = this.parser.readAttributeName(required))) {
			break;
		}
		attr.parts.push(ret);
		required = false;
	}
	return attr;
};

/**
 * @since 0.82.0
 */
Transpiler.prototype.compileAttributeParts = function(attr){
	if(attr.computed) {
		var names = [];
		attr.parts.forEach(function(part){
			if(part.computed) names.push('(' + part.name + ')');
			else names.push(JSON.stringify(part.name));
		});
		attr.name = names.join('+');
	} else {
		attr.name = attr.parts.map(function(part){ return part.name }).join("");
	}
};

/**
 * @since 0.84.0
 */
Transpiler.prototype.stringifyAttribute = function(attr){
	return attr.computed ? attr.name : '"' + attr.name + '"';
};

/**
 * @since 0.67.0
 */
Transpiler.prototype.feature = function(name){
	this.features[name] = true;
	return name;
};

/**
 * @since 0.62.0
 */
Transpiler.prototype.nextVar = function(){
	return String.fromCharCode(0x561 + this.count++ % 39);
};

/**
 * @since 0.62.0
 */
Transpiler.prototype.warn = function(message, position){
	if(!position) position = this.parser.position;
	this.warnings.push("Line " + (position.line + 1) + ", Column " + position.column + ": " + message);
};

/**
 * @since 0.50.0
 */
Transpiler.prototype.transpile = function(input){

	var start = now();
	
	this.parser = new Parser(input);

	this.count = hash(this.options.namespace + "") % 100000;
	
	this.runtime = this.nextVar();
	this.element = this.nextVar();
	this.parentElement = this.nextVar();
	this.bind = this.nextVar();
	this.anchor = this.nextVar();
	this.value = this.nextVar();
	this.index = this.nextVar();
	this.array = this.nextVar();
	this.slots = this.nextVar();
	this.slotsRegistry = this.nextVar();

	this.tagNames = {};
	var features = this.features = {};

	this.warnings = [];
	
	this.before =
		"/*! Transpiled" + (this.options.filename ? " from " + this.options.filename : "") + " using Sactory v" +
		(typeof Sactory != "undefined" ? Sactory.VERSION : version.version) + ". Do not edit manually. */" +
		"!function(a){if(typeof define=='function'&&define.amd){define(['sactory'], a)}else{a(Sactory)}}" +
		"(function(" + this.runtime + ", " + this.element + ", " + this.bind + ", " + this.anchor + ", " + this.slots + "){";
	this.source = [];

	if(this.options.scope) this.before += this.element + "=" + this.options.scope + ";";
	
	this.tags = [];
	this.inheritance = [];
	this.closing = [];
	this.modes = [];
	this.currentMode;

	this.level = 0;
	
	this.startMode(defaultMode, {}).start();
	
	var open = Transpiler.prototype.open.bind(this);
	var close = Transpiler.prototype.close.bind(this);

	while(!this.parser.eof()) {
		this.updateTemplateLiteralParser();
		this.currentMode.parser.parse(open, close);
	}
	
	this.endMode();
	
	this.after = "})";

	var source = this.source.join("");

	function addDependencies(feature) {
		if(dependencies.hasOwnProperty(feature)) {
			dependencies[feature].forEach(function(f){
				features[f] = true;
				addDependencies(f);
			});
		}
	}

	Object.keys(features).forEach(addDependencies);
	
	return {
		time: now() - start,
		variables: {
			runtime: this.runtime,
			element: this.element,
			bind: this.bind,
			anchor: this.anchor,
			value: this.value,
			index: this.index,
			array: this.array,
			slots: this.slots,
			slotsRegistry: this.slotsRegistry
		},
		scope: this.options.scope,
		sequence: this.count,
		tags: this.tagNames,
		features: Object.keys(features),
		warnings: this.warnings,
		source: {
			before: this.before,
			after: this.after,
			all: this.before + source + this.after,
			contentOnly: source
		}
	};
	
};

var dependencies = {
	// core
	create: ["update"],
	createOrUpdate: ["create", "update"],
	clone: ["update"],
	updateSlot: ["update"],
	appendAnchor: ["update"],
	mixin: ["append", "html"],
	comment: ["append"],
	// bind
	bind: ["createAnchor"],
	bindIf: ["bind"],
	bindEach: ["bind"],
	// observable
	maybeComputedObservable: ["filterObservables", "computedObservable"],
	// cssb
	convertStyle: ["compileStyle"],
	compileAndBindStyle: ["convertStyle"],
};

if(typeof window == "object") {

	var count = 0;

	function evalScripts() {
		Array.prototype.forEach.call(document.querySelectorAll("script[type='text/x-builder'], style[type='text/x-builder']"), function(builder){
			var id = count++ + "";
			var content;
			if(builder.tagName == "STYLE") {
				builder.removeAttribute("type");
				content = builder.outerHTML;
				builder.setAttribute("type", "text/x-builder");
			}
			builder.dataset.sactoryFrom = id;
			builder.dataset.to = "[data-sactory-to='" + id + "']";
			var script = document.createElement("script");
			script.dataset.sactoryTo = id;
			script.dataset.from = "[data-sactory-from='" + id + "']";
			var result = new Transpiler({namespace: id}).transpile(content || builder.textContent);
			result.warnings.forEach(function(message){
				console.warn(message);
			});
			script.textContent = result.source.all;
			document.head.appendChild(script);
		});
	}
	
	if(document.readyState == "complete") {
		evalScripts();
	} else {
		window.addEventListener("load", evalScripts);
	}
	
}

module.exports = Transpiler;
	