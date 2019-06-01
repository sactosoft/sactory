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

var modeRegistry = [];
var modeNames = {};
var defaultMode;

/**
 * @since 0.15.0
 */
Transpiler.defineMode = function(names, parser, options){
	var id = modeRegistry.length;
	modeRegistry.push({
		name: names[0],
		parser: parser,
		options: options
	});
	names.forEach(function(name){
		modeNames[name] = id;
	});
	if(options.isDefault) defaultMode = id;
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
Transpiler.replaceMode = function(mode, parser, options){
	modeRegistry[mode].parser = parser;
	if(options) modeRegistry[mode].options = options;
};

/**
 * @since 0.53.0
 */
Transpiler.getModeParser = function(mode){
	return (modeRegistry[mode] || {}).parser;
};

/**
 * @since 0.53.0
 */
Transpiler.getModeOptions = function(mode){
	return (modeRegistry[mode] || {}).options;
};

/**
 * @since 0.35.0
 */
Transpiler.startMode = function(mode, transpiler, parser, source, attributes){
	var m = modeRegistry[mode];
	var ret = new m.parser(transpiler, parser, source, attributes || {});
	ret.options = parser.options = m.options;
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
	this.add(this.element + ".__builder.text(" + expr + ", " + this.bind + ", " + this.anchor + ");");
};

TextParser.prototype.addCurrent = function(){
	var expr = [];
	var observables = [];
	for(var i in this.current) {
		var curr = this.current[i];
		if(curr.text) {
			if(curr.value.length) expr.push(stringify(this.replaceText(curr.value)));
		} else {
			Array.prototype.push.apply(observables, curr.value.observables);
			expr.push(curr.value.source); 
		}
	}
	var joined = expr.join(" + ");
	if(observables.length) {
		joined = this.runtime + "." + this.transpiler.feature("computedObservable") + "(this, " + this.bind + ", [" +
			uniq(observables).join(", ") + "], function(){return " + joined + "})";
	}
	if(joined.length) this.addText(joined);
	this.current = [];
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
	var end = this.current[this.current.length - 1];
	if(end.text) {
		var trimmed = Polyfill.trimEnd.call(end.value);
		this.add(end.value.substr(trimmed.length));
		end.value = trimmed;
	}
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
			if(pre.slice(-1) == '\\') {
				this.current[this.current.length - 1].value = this.current[this.current.length - 1].value.slice(0, -1) + '$';
				break;
			}
			this.pushExpr(this.parseCode("readVar", true));
			break;
		case '<':
			if(this.handle()) {
				this.addCurrent();
				handle();
			} else {
				this.pushText('<');
			}
			break;
		default:
			this.addCurrent();
			eof();
	}
};

TextParser.prototype.parse = function(handle, eof){
	var result = this.parser.find(['<', '$'], false, true);
	this.pushText(result.pre);
	this.parseImpl(result.pre, result.match, handle, eof);
};

/**
 * @class
 * @since 0.15.0
 */
function JavascriptParser(transpiler, parser, source, attributes) {
	BreakpointParser.call(this, transpiler, parser, source, attributes, ['(', ')', '@', '*']);
	this.observables = [];
	this.snaps = [];
	this.parentheses = [];
}

JavascriptParser.prototype = Object.create(BreakpointParser.prototype);

JavascriptParser.prototype.handleParenthesis = function(match){
	this.add(this.parser.last = match);
	this.parser.lastIndex = this.parser.index;
};

JavascriptParser.prototype.next = function(match){
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
				this.add((this.parser.last != '.' ? this.element + "." : "") + "__widget");
				var skipped = this.parser.skipImpl({strings: false});
				this.add(skipped);
				if(/[a-zA-Z_$]/.test(this.parser.peek())) this.add(".");
			} else {
				var skip = this.parser.skipImpl({strings: false});
				var peek = this.parser.peek();
				if(peek === undefined || !/[a-zA-Z0-9_]/.test(peek)) {
					this.add(this.element);
					if(skip) this.add(skip);
				} else {
					var match = this.parser.input.substr(this.parser.index).match(/^(?:((?:\.?[a-zA-Z0-9_$]+)+)(\s*)(?:(=(?!=))|(\()))/);
					if(match) {
						if(match[3]) {
							this.parser.index += match[0].length;
							this.add(this.element + skip + ".__builder" + this.parser.skipImpl({strings: false}) +
								"[0](\"" + match[1] + match[2] + "\", " + this.parseCodeToValue("readExpression") + ", " + this.bind + ", " + this.anchor + ")");
						} else {
							var add = function(runtime, fun, args){
								this.parser.index += match[0].length;
								this.add((runtime ? this.runtime + "." : "") + skip + fun + match[2] + "(" + (args || ""));
								this.parentheses.push(false);
							}.bind(this);
							switch(match[1]) {
								case "subscribe":
									add(true, "subscribe", this.bind + ", ");
									break;
								case "observe":
									add(true, "observable"); //TODO computed
									break;
								case "observe.deep":

									break;
								case "widgets.add":
									add(true, "defineWidget");
									break;
								case "widgets.remove":
									add(true, "undefineWidget");
									break;
								case "widgets.names":
									add(true, "getWidgetsNames");
									break;
								case "render":
									add(false, "render", this.transpiler.slotsRegistry + ", " + this.element + ", " + this.bind + ", " + this.anchor + ", ");
									break;
								default:
									this.add('@');
							}
							/*this.parser.index += match[0].length;
							if(match[4]) {
								this.add(this.runtime  + skip + ".subscribe" + match[11] + "(" + this.bind + ", ");
								this.parentheses.push(false);
							} else if(match[5]) {
								this.add(this.transpiler.anchorsRegistry  + skip + ".add" + match[11] + "(" + this.runtime + "." + this.transpiler.feature("createAnchor") + "(" + this.element + ", " + this.bind + ", " + this.anchor + "), ");
								this.parentheses.push(false);
							} else {
								var type = match[6] ? "Template" : "Component";
								if(match[8]) {
									this.add(this.runtime + skip + ".define" + type + match[11] + "(");
									this.add(this.parser.readExpression()); // name
									this.parser.expect(',');
									if(match[6]) {
										this.add(", this, function(" + this.element + ", " + this.bind + ", " + this.anchor + ", " + this.transpiler.args + "){(");
										this.parentheses.push(").call(this, " + this.transpiler.args + ", " + this.transpiler.args + ")}");
									} else {
										this.add(", function(" + this.transpiler.anchorsRegistry + ", " + this.element + ", " + this.bind + ", " + this.anchor + "){return new (");
										this.parentheses.push(")()}");
									}
								} else {
									this.add(this.runtime + skip + (match[9] ? ".undefine" + type : ".get" + type + "sName") + match[11] + "(");
									this.parentheses.push(false);
								}
							}*/
						}
					} else {
						this.add('@' + skip);
					}
				}
			}
			break;
		case '*':
			if(this.parser.couldStartRegExp()) {
				function getName() {
					var skipped = this.parser.skip();
					if(skipped) this.add(skipped);
					if(this.parser.peek() == '(') {
						return this.parseCodeToSource("skipEnclosedContent");
					} else {
						return this.parseCodeToSource("readVarName", true);
					}
				}
				if(this.parser.peek() == '*') {
					this.parser.index++;
					if(this.parser.peek() == '*') {
						this.parser.index++;
						// spreading an observable
						var name = getName.call(this);
						var id = this.transpiler.nextId();
						this.add(name + ".snapped(" + id + ")");
						this.snaps.push(name + ".snap(" + id + ")");
					} else {
						// new observable
						this.parser.parseTemplateLiteral = null;
						var parsed = this.transpiler.parseCode(this.parser.readSingleExpression(true));
						this.transpiler.updateTemplateLiteralParser();
						if(parsed.observables && parsed.observables.length) {
							// computed
							this.add(this.runtime + "." + this.transpiler.feature("computedObservable") + "(this, " + this.bind + ", " + parsed.toSpreadValue() + ")");
						} else {
							if(parsed.source.charAt(0) != '(') parsed.source = '(' + parsed.source + ')';
							this.add(this.runtime + "." + this.transpiler.feature("observable") + parsed.source);
						}
					}
				} else {
					// get/set observable
					var name = getName.call(this);
					this.add(name + ".value");
					this.observables.push(name);
				}
				this.parser.last = ')';
				this.parser.lastIndex = this.parser.index;
			} else {
				// just a multiplication or exponentiation
				this.add('*');
				if(this.parser.peek() == '*') this.add(this.parser.read());
				this.parser.last = '*';
			}
			break;
	}
};

/**
 * @class
 * @since 0.15.0
 */
function HTMLParser(transpiler, parser, source, attributes) {
	TextParser.call(this, transpiler, parser, source, attributes);
}

HTMLParser.prototype = Object.create(TextParser.prototype);

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

ScriptParser.prototype = Object.create(TextParser.prototype);

ScriptParser.prototype.handle = function(){
	return !!/^\/#?script>/.exec(this.parser.input.substr(this.parser.index));
};

/**
 * @class
 * @since 0.15.0
 */
function CSSParser(transpiler, parser, source, attributes) {
	TextParser.call(this, transpiler, parser, source, attributes);
}

CSSParser.prototype = Object.create(TextParser.prototype);

/**
 * @param {class} ParentParser - A class that extends TextParser.
 * @since 0.55.0
 */
function createLogicParser(ParentParser) {

	/**
	 * @class
	 * @since 0.53.0
	 */
	function LogicParser(transpiler, parser, source, attributes) {
		ParentParser.call(this, transpiler, parser, source, attributes);
		this.count = 0;
		this.statements = [];
		this.popped = [];
	}

	LogicParser.prototype = Object.create(ParentParser.prototype);

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

	LogicParser.prototype.parseLogic = function(expected, args){
		var line;
		if(
			this.parser.input.substr(this.parser.index, expected.length - 1) == expected.substr(1) && // when the expected keyword is found
			!/\S/.test(line = this.getLineText()) && // when is start of line
			!/[a-zA-Z0-9_$]/.test(this.parser.input.charAt(this.parser.index + expected.length - 1)) // when is an exact keyword
		) {
			this.parser.index += expected.length - 1;
			this.trimEnd();
			this.addCurrent();
			var statement = Polyfill.startsWith.call(expected, "else") ? this.popped.pop() : {
				startIndex: this.source.length,
				observables: []
			};
			if(args) {
				var skipped = this.parser.skipImpl({});
				if(this.parser.peek() != '(') this.parser.error("Expected '(' after '" + expected + "'.");
				var parsed = this.transpiler.parseCode(this.parser.skipEnclosedContent(), this.parser);
				Array.prototype.push.apply(statement.observables, parsed.observables);
				this.add(expected + skipped + parsed.source);
			} else {
				this.add(expected);
			}
			var skipped = this.parser.skipImpl({});
			if(!(statement.inline = (this.parser.peek() != '{'))) skipped += this.parser.read();
			this.add(skipped);
			this.statements.push(statement);
			return true;
		} else {
			if(line && line.slice(-1) == '\\') {
				var curr = this.current[this.current.length - 1];
				curr.value = curr.value.slice(0, -1);
			}
			return false;
		}
	};

	LogicParser.prototype.parse = function(handle, eof){
		var result = this.parser.find(['$', '<', 'i', 'e', 'f', 'w', '}', '\n'], false, true);
		this.pushText(result.pre);
		switch(result.match) {
			case 'i':
				if(!this.parseLogic("if", true)) this.pushText('i');
				break;
			case 'e':
				if(!this.parseLogic("else if", true) && !this.parseLogic("else", false)) this.pushText('e');
				break;
			case 'f':
				if(!this.parseLogic("for", true)) this.pushText('f');
				break;
			case 'w':
				if(!this.parseLogic("while", true)) this.pushText('w');
				break;
			case '}':
				if(result.pre.slice(-1) == '\\') {
					var curr = this.current[this.current.length - 1];
					curr.value = curr.value.slice(0, -1) + '}';
				} else if(this.statements.length) {
					this.trimEnd();
					this.addCurrent();
					this.add('}');
					var statement = this.statements.pop();
					statement.endIndex = this.source.length;
					this.popped.push(statement);
				} else {
					this.pushText('}');
				}
				break;
			case '\n':
				if(this.statements.length && this.statements[this.statements.length - 1].inline) {
					this.trimEnd();
					this.addCurrent();
					var statement = this.statements.pop();
					statement.endIndex = this.source.length;
					this.popped.push(statement);
					this.add('\n');
				} else {
					this.pushText('\n');
				}
				break;
			default:
				this.parseImpl(result.pre, result.match, handle, eof);
		}
	};

	LogicParser.prototype.end = function(){
		var sorted = [];
		this.popped.forEach(function(popped){
			if(popped.observables) {
				sorted.push(
					{index: popped.startIndex, start: true, observables: popped.observables},
					{index: popped.endIndex, start: false}
				);
			}
		});
		sorted.sort(function(a, b){
			return a.index - b.index;
		});
		var shift = 0;
		for(var i=0; i<sorted.length; i++) {
			var popped = sorted[i];
			this.source.splice(popped.index + shift++, 0, popped.start ? this.runtime + "." + this.transpiler.feature("bind") + "(this, " + this.element + ", " + this.bind + ", " + this.anchor +
				", [" + uniq(popped.observables).join(", ") + "], 0, 0, function(" + this.element + ", " + this.bind + ", " + this.anchor + "){" : "});");
		}
	};

	return LogicParser;

}

/**
 * @class
 * @since 0.53.0
 */
var HTMLLogicParser = createLogicParser(HTMLParser);

/**
 * @class
 * @since 0.55.0
 */
var CSSLogicParser = createLogicParser(CSSParser);

/**
 * @class
 * @since 0.15.0
 */
function CSSBParser(transpiler, parser, source, attributes) {
	SourceParser.call(this, transpiler, parser, source, attributes);
	this.observables = [];
	this.snaps = [];
	this.expr = [];
	this.scopes = ["__root"];
	this.scope = !!attributes.scoped;
}

CSSBParser.prototype = Object.create(SourceParser.prototype);

CSSBParser.prototype.parseCodeImpl = function(source){
	var parsed = this.transpiler.parseCode(source, this.parser);
	if(parsed.observables) Array.prototype.push.apply(this.observables, parsed.observables);
	if(parsed.snaps) Array.prototype.push.apply(this.snaps, parsed.snaps);
	return parsed.source;
};

CSSBParser.prototype.addScope = function(selector){
	var scope = "__" + this.transpiler.nextId();
	this.add("var " + scope + "=" + this.runtime + "." + this.transpiler.feature("select") + "(" + this.scopes[this.scopes.length - 1] + "," + selector + ");");
	this.scopes.push(scope);
};

CSSBParser.prototype.removeScope = function(){
	this.scopes.pop();
};

CSSBParser.prototype.skip = function(){
	var skipped = this.parser.skip();
	if(skipped) this.add(skipped);
};

CSSBParser.prototype.start = function(){
	this.add(this.runtime + "." + this.transpiler.feature("compileAndBindStyle") + "(function(){");
	this.add("var " + this.scopes[0] + "=[];");
	if(this.scope) this.addScope("\".__sa\" + " + this.element + ".__builder.runtimeId");
};

CSSBParser.prototype.parse = function(handle, eof){
	this.parser.parseTemplateLiteral = null;
	this.skip();
	var input = this.parser.input.substr(this.parser.index);
	var length;
	function start(value) {
		if(Polyfill.startsWith.call(input, value)) {
			length = value.length;
			return true;
		} else {
			return false;
		}
	}
	function skipStatement() {
		this.add(this.parser.input.substr(this.parser.index, length));
		this.parser.index += length;
		this.skip();
	}
	if(start( "if") || start("else if") || start("for") || start("while")) {
		skipStatement.call(this);
		if(this.parser.peek() != '(') this.parser.error("Expected '(' after statement name (if/else if/for/while).");
		this.add(this.parseCodeImpl(this.parser.skipEnclosedContent()));
		this.skip();
		if(this.parser.peek() == '{') {
			this.add(this.parser.read());
			this.expr.push(true);
		}
	} else if(start("else")) {
		skipStatement.call(this);
		if(this.parser.peek() == '{') {
			this.add(this.parser.read());
			this.expr.push(true);
		}
	} else if(start("var ") || start("const ") || start("let ")) {
		skipStatement.call(this);
		this.add(this.parser.readVarName(true));
		this.skip();
		this.parser.expect('=');
		this.add('=');
		this.skip();
		this.add(CSSBParser.createExpr(this.parseCodeImpl(this.parser.find([';'], true, true).pre), this.transpiler) + ';');
	} else {
		var parseCodeImpl = this.parseCodeImpl.bind(this);
		var transpiler = this.transpiler;
		function value(e, computable) {
			e = (function(){
				// concat strings
				var ret = [];
				e.forEach(function(v){
					if(v.string && ret[ret.length - 1] && ret[ret.length - 1].string) ret[ret.length - 1].value += v.value;
					else ret.push(v);
				});
				return ret;
			})();
			if(e.length && e[0].string && (e[0].value = Polyfill.trimStart.call(e[0].value)).length == 0) e.shift();
			if(e.length && e[e.length - 1].string && (e[e.length - 1].value = Polyfill.trimEnd.call(e[e.length - 1].value)).length == 0) e.pop();
			if(e.length) {
				var ret = [];
				e.forEach(function(v){
					ret.push(v.string && stringify(v.value) || (!computable && parseCodeImpl(v.value) || CSSBParser.createExpr(parseCodeImpl(v.value), transpiler)));
				});
				return ret.join('+');
			} else {
				return "\"\"";
			}
		}
		var search = ['<', '$', '{', '}', ';', ':'];
		var expr = {key: [], value: []};
		var curr = expr.key;
		if(this.parser.peek() == '@') {
			search.pop();
			this.parser.options.inlineComments = false;
		}
		do {
			var loop = false;
			var result = this.parser.find(search, false, true);
			if(result.pre.length) curr.push({string: true, value: result.pre});
			switch(result.match) {
				case '<':
					handle();
					break;
				case '$':
					if(result.pre.slice(-1) == '\\') curr[curr.length - 1].value = curr[curr.length - 1].value.slice(0, -1) + '$';
					else curr.push({string: false, value: this.parser.readVar(true)});
					loop = true;
					break;
				case ':':
					search.pop();
					curr = expr.value;
					loop = true;
					this.parser.options.inlineComments = false;
					break;
				case '{':
					if(expr.value.length) {
						this.addScope(value(expr.key.concat({string: true, value: ':'}).concat(expr.value)));
					} else {
						this.addScope(value(expr.key));
					}
					this.expr.push(false);
					break;
				case '}':
					if(this.expr.pop()) {
						this.add("}");
					} else {
						this.removeScope();
					}
					break;
				case ';':
					this.add(this.scopes[this.scopes.length - 1] + ".push({key:" + value(expr.key) + (expr.value.length && ",value:" + value(expr.value, true) || "") + "});");
					break;
				default:
					eof();
			}
		} while(loop);
		this.parser.options.inlineComments = true; // restore
	}
};

CSSBParser.prototype.end = function(){
	this.add("return " + this.scopes[0] + "}, " + this.element + ", " + this.bind + ", [" + uniq(this.observables).join(", ") + "], [" + this.snaps.join(", ") + "])");
};

CSSBParser.prototype.afterappend = function(){
	if(this.scope) return "function(){ this.parentNode.__builder.addClass(\"__sa\" + this.__builder.runtimeId); }";
};

CSSBParser.prototype.beforeremove = function(){
	if(this.scope) return "function(){ this.parentNode.__builder.removeClass(\"__sa\" + this.__builder.runtimeId); }";
};

CSSBParser.createExprImpl = function(expr, info, transpiler){
	var parser = new Parser(expr);
	function skip() {
		var skipped = parser.skipImpl({strings: false, comments: true});
		if(skipped) info.computed += skipped;
	}
	function readSign() {
		var result = parser.readImpl(/^(\+\+?|\-\-?)/, false);
		if(result) {
			info.computed += result;
			info.op++;
		}
	}
	function readOp() {
		var result = parser.readImpl(/^(\+|\-|\*|\/|\%)/, false);
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
			if(!CSSBParser.createExprImpl(parser.skipEnclosedContent().slice(1, -1), info, transpiler)) return false;
			info.computed += ')';
		} else {
			var v = parser.readSingleExpression(true);
			if(/^[a-zA-Z_\$]/.exec(v)) {
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

CSSBParser.createExpr = function(expr, transpiler){
	var param = "__" + transpiler.nextId();
	var info = {
		runtime: transpiler.runtime,
		param: param,
		computed: "(function(" + param + "){return " + transpiler.runtime + "." + transpiler.feature("computeUnit") + "(" + param + ",",
		is: false,
		op: 0
	};
	var ret = "";
	var parser = new Parser(CSSBParser.createExprImpl(expr, info, transpiler) && info.is && info.op && (info.computed + ")})({})") || expr);
	parser.options = {comments: true, strings: true};
	while(true) {
		var result = parser.find(['#'], false, true);
		ret += result.pre;
		if(result.match) ret += transpiler.runtime + ".css.";
		else break;
	}
	return ret;
};

// export parsers

Transpiler.Internal = {
	Parser: Parser,
	SourceParser: SourceParser,
	BreakpointParser: BreakpointParser,
	TextParser: TextParser,
	JavascriptParser: JavascriptParser,
	HTMLParser: HTMLParser,
	HTMLLogicParser: HTMLLogicParser,
	SourceParser: SourceParser,
	CSSParser: CSSParser,
	CSSLogicParser: CSSLogicParser,
	CSSBParser: CSSBParser
};

// register default modes

Transpiler.defineMode(["code", "javascript", "js"], JavascriptParser, {isDefault: true, code: true, regexp: true});
Transpiler.defineMode(["html"], HTMLParser, {comments: false, strings: false});
Transpiler.defineMode(["text"], HTMLParser, {comments: false, strings: false, children: false});
Transpiler.defineMode(["script"], ScriptParser, {comments: false, strings: false, children: false, tags: ["script"]});
Transpiler.defineMode(["css"], CSSParser, {comments: true, inlineComments: false, strings: true, children: false});
Transpiler.defineMode(["html:logic", "hl"], HTMLLogicParser, {whitespaces: false, comments: false, strings: false});
Transpiler.defineMode(["text:logic", "tl"], HTMLLogicParser, {whitespaces: false, comments: false, strings: false, children: false});
Transpiler.defineMode(["css:logic", "cl"], CSSLogicParser, {whitespaces: false, comments: true, inlineComments: false, strings: true, children: false});
Transpiler.defineMode(["cssb", "style"], CSSBParser, {strings: true, children: false, tags: ["style"]});

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
			Array.prototype.push.apply(mode.snaps, parsed.snaps);
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
	var $this = this;
	var ret = {
		source: source,
		observables: observables,
		snaps: mode.snaps,
		toValue: function(){
			if(observables.length) {
				if(input.charAt(0) == '*' && source == input.substr(1) + ".value") {
					// single observable, pass it raw so it can be used in two-way binding
					return input.substr(1);
				} else {
					return $this.runtime + "." + $this.feature("computedObservable") + "(this, " + $this.bind + ", " + ret.toSpreadValue() + ")";
				}
			} else {
				return source;
			}
		},
		toSpreadValue: function(){
			return "[" + observables.join(", ") + "], function(){return " + source + "}" + (mode.snaps && mode.snaps.length ? ", " + mode.snaps.join(", ") : "");
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
		this.namespaces.pop();
		this.inheritance.pop();
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
		if(this.parser.input.substr(this.parser.index, 8) == "COMMENT ") {
			this.parser.index += 8;
			this.source.push("/*" + this.parser.findSequence(">", true).slice(0, -1) + "*/");
		} else {
			this.parser.expect('-');
			this.parser.expect('-');
			this.source.push(this.runtime + "." + this.feature("comment") + "(" + this.element + ", " + this.bind + ", " + this.anchor + ", " + stringify(this.parser.findSequence("-->", true).slice(0, -3)) + ")");
			this.addSemicolon();
		}
	} else if(this.currentMode.options.children === false) {
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
		var newMode = undefined;
		var create = true; // whether a new element is being created
		var update = true; // whether the element is being updated, only considered if create is false
		var append = true; // whether the element should be appended to the current element after its creation
		var unique = false; // whether the new element should be appended always or only when its not already on the DOM
		var parent = this.element; // element that the new element will be appended to, if not null
		var element = this.element; // element that will be updated
		var iattributes = {}; // attributes used to give instructions to the transpiler, not used at runtime
		var rattributes = []; // attributes used at runtime to modify the element
		var sattributes = []; // variable name of the attributes passed using the spread syntax
		var currentNamespace = this.namespaces[this.namespaces.length - 1];
		var currentInheritance = null;
		var currentClosing = [];
		var createAnchor;
		var computed = false;
		var selector, originalTagName, tagName = "";
		var selectorAll = false;
		var slotName;
		this.updateTemplateLiteralParser();
		if(selector = this.parser.readQueryExpr()) {
			selector = this.parseCode(selector).source;
			selectorAll = !!this.parser.readIf('+');
			create = append = false;
		} else {
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
				var names = [];
				var value = "\"\"";
				if(next == '{') {
					this.parser.index++;
					do {
						skip();
						names.push(this.parseAttributeName());
						skip();
					} while((next = this.parser.read()) == ',');
					if(next != '}') this.parser.error("Expected '}' after attribute names list.");
				} else {
					names.push(this.parseAttributeName());
				}
				var add = false;
				skip(true);
				if(this.parser.peek() == '=') {
					this.parser.index++;
					skip();
					this.parser.parseTemplateLiteral = null;
					var prefix = names[0].prefix;
					for(var i=1; i<names.length; i++) {
						if(names[i].prefix != prefix) {
							prefix = null;
							break;
						}
					}
					var name = names.length == 1 ? names[0].name : "";
					value = this.parser.readAttributeValue();
					if(value.charAt(0) == '#') value = this.runtime + ".functions." + value.substr(1) + "()";
					if(names.every(function(a){ return a.prefix == '@' || a.prefix == '+'; })) {
						value = this.wrapFunction(value, false, "event");
					} else if(names.length == 1 && names[0].prefix == ':') {
						if(name == "change") {
							value = this.wrapFunction(value, true, "oldValue", "newValue");
						} else if(name == "condition" || name == "if") {
							value = this.wrapFunction(value, true);
						} else if(name == "cleanup") {
							value = this.wrapFunction(value, false);
						}
					}
					value = this.parseCode(value).toValue();
					skip(true);
				}
				for(var i in names) {
					var attr = names[i];
					var add = attr.computed;
					attr.value = value;
					if(!add) {
						if(attr.prefix == "@" && !attr.name) {
							parent = value;
						} else if(attr.prefix == "@" && attr.name == "anchor") {
							createAnchor = value;
						} else if(attr.prefix == '#') {
							newMode = modeNames[attr.name];
						} else if(attr.prefix == ':') {
							var prev;
							if(Polyfill.startsWith.call(attr.name, "next:") || (prev = Polyfill.startsWith.call(attr.name, "prev:"))) {
								attr.prefix = "";
								attr.name = attr.name.substr(5);
								attr.value = this.runtime + "." + this.feature((prev ? "prev" : "next") + "Id") + "()";
								if(value != "\"\"") attr.value = value + " + " + attr.value;
								add = true;
							} else {
								iattributes[attr.name] = value;
							}
						} else {
							add = true;
						}
					}
					if(add) {
						rattributes.push(attr);
					}
				}
			}
			next = false;
		}
		if(!next) this.parser.errorAt(position, "Tag was not closed.");
		if(iattributes.namespace) currentNamespace = iattributes.namespace;

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
						case "window":
						case "document":
							element = name;
							create = append = false;
							break;
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
						case "shadow":
							break;
						case "anchor":
							tagName = ":bind";
							iattributes.to = "[]";
						default:
							create = update = append = false;
					}
				}
			} else if(tagName.charAt(0) == '#') {
				newMode = modeNames[tagName.substr(1)];
				if(newMode !== undefined) create = update = append = false; // behave as a scope
			} else if(tagName.charAt(0) == '@') {
				create = append = false;
				tagName = tagName.substr(1);
			} else {
				if(tagName) {
					if(this.tagNames.hasOwnProperty(tagName)) this.tagNames[tagName]++;
					else this.tagNames[tagName] = 1;
				}
				if(!iattributes.namespace) {
					if(tagName == "svg") currentNamespace = "\"svg\"";
					else if(tagName == "math") currentNamespace = "\"mathml\"";
				}
			}
		}

		if(newMode === undefined) {
			for(var i=0; i<modeRegistry.length; i++) {
				var info = modeRegistry[i];
				if(info.options.tags && info.options.tags.indexOf(tagName) != -1) {
					newMode = i;
					break;
				}
			}
		}

		if(iattributes.window) parent = "window";
		else if(iattributes.document) parent = "document";
		else if(iattributes.root) parent = parent + ".getRootNode({composed: " + (iattributes.composed || "false") + "})";
		else if(iattributes.html) parent = "document.documentElement";
		else if(iattributes.head) parent = "document.head";
		else if(iattributes.body) parent = "document.body";
		function createExprOptions() {
			var ret = "";
			currentInheritance = "";
			var inheritance = this.inheritance.join("");
			var args = !!(inheritance || rattributes.length);
			if(currentNamespace) ret += "namespace:" + currentNamespace + ",";
			if(args) ret += "args:[";
			if(inheritance) ret += inheritance;
			for(var i=0; i<rattributes.length; i++) {
				var attribute = rattributes[i];
				var expr = this.runtime + "." + this.feature("attr") + "(" +
					{'@': 0, '': 1, '*': 2, '+': 3, '-': 4, '$': 5}[attribute.prefix] + ", " +
					(attribute.computed ? attribute.name : '"' + (attribute.name || "") + '"') +
					(attribute.value != "\"\"" || attribute.optional ? ", " + attribute.value : "") +
					(attribute.optional ? ", 1" : "") + "),";
				if(attribute.inherit) currentInheritance += expr;
				ret += expr;
			}
			if(args) ret = ret.slice(0, -1) + "],";
			if(sattributes.length) ret += "spread:[" + sattributes.join(",") + "],";
			return "{" + ret.slice(0, -1) + "}";
		}
		parser.index++;
		if(parent == "\"\"" || iattributes.orphan) {
			// an empty string and null have the same behaviour but null is faster as it avoids the query selector controls when appending
			parent = "null";
			append = false;
		}
		if(newMode !== undefined) {
			this.startMode(newMode, iattributes);
		}

		if(selector) {
			this.source.push(this.runtime + "." + this.feature("query") + "(this, " + parent + ", " + selector + ", " + selectorAll + ", function(" + this.element + ", " + this.parentElement + "){");
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
		var conditional = false;

		var bindType = "";
		if(tagName == ":bind-if" || tagName == ":if") bindType = "If";
		else if(tagName == ":bind-each" || tagName == ":each") bindType = "Each";
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
			if(!create) before = false;
			currentClosing.unshift("})");
		}

		if(slotName) {
			before.push([this.feature("updateSlot"), this.bind, this.anchor, createExprOptions.call(this), this.slots, '"' + tagName + '"', '"' + slotName + '"', "function(" + this.element + ", " + this.anchor + "){"]);
			call = update = append = false;
			beforeClosing += "}";
		} else if(iattributes.clone) {
			before.push([this.feature("clone"), element, this.bind, this.anchor, createExprOptions.call(this)]);
		} else if(create) {
			update = false;
			if(tagName == ":shadow") {
				before.push(["set", "element", parent + ".attachShadow({mode: " + (iattributes.mode || "\"open\"") + "})"]);
				append = false;
			} else {
				if(tagName == ":fragment") {
					before.push(["set", "element", "document.createDocumentFragment()"]);
				} else {
					before.push([this.feature("create"), this.bind, this.anchor, computed ? tagName : '"' + tagName + '"', createExprOptions.call(this)]);
				}
			}
		}
		if(update) {
			before.push([this.feature("update"), element, this.bind, this.anchor, createExprOptions.call(this)]);
		}
		if(append) {
			var hooks = newMode !== undefined ? [this.currentMode.parser.afterappend() || 0, this.currentMode.parser.beforeremove() || 0] : [];
			before.push([this.feature("append"), parent, this.bind, this.anchor].concat(hooks));
		}
		if(next == '/') {
			this.parser.expect('>');
			inline = true;
			call = false;
		}
		if(before && (call || iattributes.slot)) {
			// create body
			if(create && append && !iattributes.append) {
				// move the append function in the 'after' calls, so the DOM tree won't be re-rendered too much
				after.push(before.pop());
			}
			if(before.length == 0) {
				// nothing was created or updated, the container must be set manually
				before.push(["set", "container", parent]);
			}
			before.push([this.feature("body"), this.slots, "function(" + this.element + ", " + this.anchor + ", " + this.slots + "){"]);
			beforeClosing += "}";
		}

		var runtime = this.runtime;
		function mapNext(a) {
			if(a[0] == "set") {
				return ".set(" + JSON.stringify(a[1]) + ", " + a[2] + ")";
			} else {
				return ".next(" + runtime + "." + a[0] + ", " + a.slice(1).join(", ") + ")";
			}
		}

		if(before) {
			if(before.length) {
				this.source.push(this.runtime + (conditional ? "." + this.feature("cond") : "") + "(this)" + before.map(mapNext).join("").slice(0, -1));
				currentClosing.unshift(")" + after.map(mapNext).join("") + ".close()");
			} else {
				this.source.push(parent);
			}
		}

		if(iattributes.slot) {
			var slots = Array(iattributes.slot);
			for(var i=0; i<slots.length; i++) {
				this.source.push(this.slotsRegistry + ".add(null, " + slots[i] + ", " + this.element + ");");
			}
		}

		currentClosing = beforeClosing + currentClosing.join("");

		if(inline) {
			if(newMode !== undefined) {
				this.endMode();
			}
			this.source.push(currentClosing);
			this.addSemicolon();
		} else {
			if(currentInheritance === null) createExprOptions.call(this); // always call to trigger attribute inheritance
			this.namespaces.push(currentNamespace);
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
Transpiler.prototype.parseAttributeName = function(){
	var attr = {};
	attr.inherit = !!this.parser.readIf('~');
	attr.optional = !!this.parser.readIf('?');
	attr.prefix = this.parser.readAttributePrefix();
	if(attr.prefix == ':' && (attr.inherit || attr.optional)) this.parser.error("Compile-time attributes cannot be inherited nor optional.");
	if(attr.prefix == '#' && (attr.inherit || attr.optional)) this.parser.error("Mode attributes cannot be inherited nor optional.");
	attr.computed = false;
	var parts = [];
	var required = attr.prefix != '@' && attr.prefix != '$';
	while(true) {
		var ret = {};
		if(ret.name = this.parser.readComputedExpr()) {
			if(attr.prefix == ':') this.parser.error("Compile-time attribute names cannot be computed.");
			if(attr.prefix == '#') this.parser.error("Mode attribute names cannot be computed.");
			attr.computed = ret.computed = true;
			if(ret.name.charAt(0) == '[' && ret.name.charAt(ret.name.length - 1) == ']') {
				ret.name = this.runtime + ".config.shortcut." + ret.name.slice(1, -1);
			} else {
				ret.name = this.parseCode(ret.name).source;
			}
		} else if(!(ret.name = this.parser.readAttributeName(required))) {
			break;
		}
		parts.push(ret);
		required = false;
	}
	if(attr.computed) {
		parts.forEach(function(part){
			if(part.computed) part.name = '(' + part.name + ')';
			else part.name = JSON.stringify(part.name);
		});
		attr.name = parts.map(function(part){ return part.name; }).join('+');
	} else {
		if(parts.length) attr.name = parts[0].name;
	}
	return attr;
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
	return "$_" + this.count++ % 100;
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

	var start = performance.now();
	
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
	this.args = this.nextVar();
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
	this.namespaces = [];
	this.inheritance = [];
	this.closing = [];
	this.modes = [];
	this.currentMode;
	
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
		time: performance.now() - start,
		variables: {
			runtime: this.runtime,
			element: this.element,
			bind: this.bind,
			anchor: this.anchor,
			value: this.value,
			index: this.index,
			array: this.array,
			args: this.args,
			slots: this.slots,
			slotsRegistry: this.slotsRegistry
		},
		scope: this.options.scope,
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
	appendAnchor: ["update"],
	comment: ["append"],
	// bind
	bind: ["createAnchor"],
	bindIf: ["bind"],
	bindEach: ["bind"],
	// cssb
	compileAndBindStyle: ["compileStyle"]
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
	