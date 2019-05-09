// init global variables
require("./dom");

var Polyfill = require("./polyfill");
var Util = require("./util");
var Parser = require("./parser");

var Sactory = {};

var modeRegistry = [];
var modeNames = {};
var defaultMode;

/**
 * @since 0.15.0
 */
Sactory.registerMode = function(displayName, names, parser, options){
	var id = modeRegistry.length;
	modeRegistry.push({
		name: displayName,
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
 * @since 0.35.0
 */
Sactory.startMode = function(mode, namespace, parser, element, source, attributes){
	var m = modeRegistry[mode];
	return m && new m.parser({info: m.info, namespace: namespace || "", parser: parser, element: element || "", source: source || []}, attributes || {});
};

/**
 * @since 0.35.0
 */
Sactory.startModeByName = function(mode, namespace, parser, element, source, attributes){
	return Sactory.startMode(modeNames[mode], namespace, parser, element, source, attributes);
};

/**
 * @class
 * @since 0.15.0
 */
function SourceParser(data, attributes) {
	this.info = data.info;
	this.namespace = data.namespace;
	this.parser = data.parser;
	this.element = data.element;
	this.source = data.source;
}

SourceParser.prototype.add = function(text){
	this.source.push(text);
};

SourceParser.prototype.start = function(){};

SourceParser.prototype.end = function(){};

SourceParser.prototype.finalize = function(){};

SourceParser.prototype.parse = function(handle, eof, parseCode){};

/**
 * @class
 * @since 0.29.0
 */
function BreakpointParser(data, attributes, breakpoints) {
	SourceParser.call(this, data, attributes);
	this.breakpoints = ['<'].concat(breakpoints);
}

BreakpointParser.prototype = Object.create(SourceParser.prototype);

BreakpointParser.prototype.next = function(match, parseCode){};

BreakpointParser.prototype.parse = function(handle, eof, parseCode){
	var result = this.parser.find(this.breakpoints, false, true);
	if(result.pre) this.add(result.pre);
	if(result.match == '<') {
		if(this.info.options.code && [undefined, '(', '[', '{', '}', ';', ':', ',', '=', '/', '?', '&', '|', '>'].indexOf(this.parser.last) == -1 && !this.parser.lastKeyword("return")) {
			// just a comparison
			this.add("<");
		} else {
			handle();
		}
	} else if(result.match) {
		this.next(result.match, parseCode);
	} else {
		eof();
	}
};

/**
 * @class
 * @since 0.28.0
 */
function TextParser(data, attributes) {
	SourceParser.call(this, data, attributes);
	this.textMode = false;
}

TextParser.prototype = Object.create(SourceParser.prototype);

TextParser.prototype.replaceText = function(text){
	return text;
};

TextParser.prototype.handle = function(){
	return true;
};

TextParser.prototype.parse = function(handle, eof, parseCode){
	var result = this.parser.find(['<', '$']);
	if(result.pre) {
		this.add(this.element + ".__builder.text=" + JSON.stringify(this.replaceText(result.pre)).replace(/\\n/gm, "\\n\" +\n\"") + ";");
	}
	switch(result.match) {
		case '$':
			this.add(this.element + ".__builder.text=" + parseCode(this.parser.readVar(true), this.parser).toValue() + ";");
			break;
		case '<':
			if(this.handle()) handle();
			else this.add(this.element + ".__builder.text='<';");
			break;
		default:
			eof();
	}
};

/**
 * @class
 * @since 0.15.0
 */
function JavascriptParser(data, attributes) {
	BreakpointParser.call(this, data, attributes, ['@', '*']);
	this.observables = [];
}

JavascriptParser.prototype = Object.create(BreakpointParser.prototype);

JavascriptParser.prototype.next = function(match, parseCode){
	switch(match) {
		case '@':
			if(this.parser.peek() == '@') {
				this.add('@');
				this.parser.index++;
			} else {
				var skip = this.parser.skip();
				if(this.parser.peek() == '=') {
					this.add("var " + this.element);
					if(skip) this.add(skip);
				} else {
					this.add(this.element);
					if(skip) this.add(skip);
					if(this.parser.input.substr(this.parser.index).search(/^(text|visible|hidden)[\s]*=/) === 0) this.add(".__builder.");
					else if(this.parser.peek() && this.parser.peek().search(/[a-zA-Z0-9_]/) === 0) this.add(".");
				}
			}
			break;
		case '*':
			if(this.parser.last === undefined || !this.parser.last.match(/^[a-zA-Z0-9_$\)\]]$/) || this.parser.lastKeyword("return")) {
				function getName() {
					var skipped = this.parser.skip();
					if(skipped) this.add(skipped);
					if(this.parser.peek() == '(') {
						var start = this.parser.index;
						this.parser.skipExpr();
						return this.parser.input.substring(start, this.parser.index);
					} else {
						return this.parser.readVarName(true);
					}
				}
				if(this.parser.peek() == '*') {
					this.parser.index++;
					if(this.parser.peek() == '*') {
						this.parser.index++;
						// spreading an observable
						this.add(getName.call(this) + ".value");
					} else {
						// new observable
						var parsed = parseCode(this.parser.readExpr());
						if(parsed.observables && parsed.observables.length) {
							// computed
							this.add("Sactory.computedObservable(" + parsed.toValue() + ")");
						} else {
							this.add("Sactory.observable(" + parsed.source + ")");
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
				// just a multiplication
				this.add('*');
			}
			break;
	}
};

/**
 * @class
 * @since 0.15.0
 */
function HTMLParser(data, attributes) {
	TextParser.call(this, data, attributes);
}

HTMLParser.prototype = Object.create(TextParser.prototype);

var replaceEntities = Text.replaceEntities || (function(){
	var converter;
	return function(data){
		if(!converter) converter = document.createElement("textarea");
		converter.innerHTML = data;
		return converter.value;
	}
})();

HTMLParser.prototype.replaceText = function(text){
	return replaceEntities(text);
};

/**
 * @class
 * @since 0.37.0
 */
function ScriptParser(data, attributes) {
	TextParser.call(this, data, attributes);
}

ScriptParser.prototype = Object.create(TextParser.prototype);

ScriptParser.prototype.handle = function(){
	return !!/^\/#?script>/.exec(this.parser.input.substr(this.parser.index));
};

/**
 * @class
 * @since 0.15.0
 */
function CSSParser(data, attributes) {
	TextParser.call(this, data, attributes);
}

CSSParser.prototype = Object.create(TextParser.prototype);

/**
 * @class
 * @since 0.15.0
 */
function CSSBParser(data, attributes) {
	SourceParser.call(this, data, attributes);
	this.expr = [];
	this.scopes = ["__" + Util.nextId(this.namespace, true)];
	this.scope = attributes.scoped && ("__sactory" + Util.nextId(this.namespace));
}

CSSBParser.prototype = Object.create(SourceParser.prototype);

CSSBParser.prototype.addScope = function(selector){
	var scope = "__" + Util.nextId(this.namespace, true);
	this.add("var " + scope + "=Sactory.select(" + this.scopes[this.scopes.length - 1] + "," + selector + ");");
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
	this.add("var " + this.scopes[0] + "=[];");
	if(this.scope) {
		this.addScope("\"." + this.scope + "\"");
	}
};

CSSBParser.prototype.parse = function(handle, eof, parseCode){
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
		if(this.parser.peek() != '(') this.parser.error("Expected '(' after statement (if/else if/for/while).");
		var start = this.parser.index;
		this.parser.skipExpr();
		this.add(parseCode(this.parser.input.substring(start, this.parser.index), this.parser).source);
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
		this.add(CSSBParser.createExpr(parseCode(this.parser.find([';'], true, true).pre, this.parser).source, this.namespace) + ';');
	} else {
		var parser = this.parser;
		var namespace = this.namespace;
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
					ret.push(v.string && JSON.stringify(v.value) || (!computable && parseCode(v.value, parser).source || CSSBParser.createExpr(parseCode(v.value, parser).source, namespace)));
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
					curr.push({string: false, value: this.parser.readVar(true)});
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
					this.add(this.scopes[this.scopes.length - 1] + ".push({k:" + value(expr.key) + (expr.value.length && ",v:" + value(expr.value, true) || "") + "});");
					break;
				default:
					eof();
			}
		} while(loop);
		this.parser.options.inlineComments = true; // restore
	}
};

CSSBParser.prototype.end = function(){
	this.add(this.element + ".textContent=Sactory.compilecssb(" + this.scopes[0] + ");");
};

CSSBParser.prototype.finalize = function(){
	if(this.scope) this.add(", function(){ this.parentNode.__builder.addClass(\"" + this.scope + "\"); }, function(){ this.parentNode.__builder.removeClass(\"" + this.scope + "\"); }");
};

CSSBParser.createExprImpl = function(expr, info){
	var parser = new Parser(expr);
	function skip() {
		var skipped = parser.skipImpl({strings: false, comments: true});
		if(skipped) info.computed += skipped;
	}
	function readSign() {
		var result = parser.readImpl(/^((\+\+?)|(\-\-?))/, false);
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
			parser.skipExpr();
			if(!CSSBParser.createExprImpl(parser.input.substring(start, parser.index - 1), info)) return false;
			info.computed += ')';
		} else {
			var v = parser.readExpr();
			if(/^[a-zA-Z_\$]/.exec(v)) {
				// it's a variable
				info.is = true;
				info.computed += "Sactory.unit(" + info.param + "," + v + ")";
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

CSSBParser.createExpr = function(expr, namespace){
	var param = "__" + Util.nextId(namespace, true);
	var info = {
		param: param,
		computed: "(function(" + param + "){return Sactory.compute(" + param + ",",
		is: false,
		op: 0
	};
	var ret = "";
	var parser = new Parser(CSSBParser.createExprImpl(expr, info) && info.is && info.op && (info.computed + ")})({})") || expr);
	parser.options = {comments: true, strings: true};
	while(true) {
		var result = parser.find(['#'], false, true);
		ret += result.pre;
		if(result.match) ret += "Sactory.css.";
		else break;
	}
	return ret;
};

// export parsers

Sactory.Internal = {
	Parser: Parser,
	SourceParser: SourceParser,
	BreakpointParser: BreakpointParser,
	TextParser: TextParser,
	JavascriptParser: JavascriptParser,
	HTMLParser: HTMLParser,
	SourceParser: SourceParser,
	CSSParser: CSSParser,
	CSSBParser: CSSBParser
};

// register default modes

Sactory.registerMode("Javascript", ["javascript", "js", "code"], JavascriptParser, {isDefault: true, code: true});
Sactory.registerMode("HTML", ["html"], HTMLParser, {comments: false, strings: false});
Sactory.registerMode("Text", ["text"], HTMLParser, {comments: false, strings: false, children: false});
Sactory.registerMode("Script", ["script"], ScriptParser, {comments: false, strings: false, children: false, tags: ["script"]});
Sactory.registerMode("CSS", ["css"], CSSParser, {inlineComments: false, strings: false, children: false});
Sactory.registerMode("CSSB", ["cssb", "style", "fcss"], CSSBParser, {strings: false, children: false, tags: ["style"]});

Sactory.convertSource = function(input, options){

	function nextId(numeric) {
		return Util.nextId(options.namespace, !numeric);
	}
	
	var parser = new Parser(input);
	
	var element = "__" + nextId();
	var bind = "__" + nextId();
	var anchor = "__" + nextId();
	
	var source = ["(function(Sactory, " + element + ", " + bind + ", " + anchor + "){"];
	
	var tags = [];
	var inheritance = [];
	var closing = [];
	var modes = [];
	var currentMode;
	
	function startMode(mode, attributes) {
		var info = modeRegistry[mode];
		if(!info) throw new Error("Mode '" + mode + "' could not be found.");
		var currentParser = new info.parser({info: info, namespace: options.namespace, parser: parser, element: element, source: source}, attributes);
		parser.options = info.options;
		currentMode = {
			name: info.name,
			parser: currentParser,
			options: info.options
		};
		modes.push(currentMode);
		return currentParser;
	}
	
	function endMode() {
		var ret = modes.pop().parser;
		ret.end();
		currentMode = modes[modes.length - 1];
		if(currentMode) parser.options = currentMode.options;
		return ret;
	}
	
	startMode(defaultMode, {}).start();
	
	/**
	 * Inserts a semicolon after a tag creation if needed.
	 */
	function addSemicolon() {
		if(currentMode.options.code) {
			var skip = parser.skip();
			var peek = parser.peek();
			if(peek != ';' && peek != ':' && peek != ',' && peek != '.' && peek != ')' && peek != ']' && peek != '}') source.push(";");
			if(skip) source.push(skip);
		} else {
			source.push(";");
		}
	}
	
	/**
	 * Closes a scope and optionally ends the current mode and restores the
	 * previous one.
	 */
	function close() {
		var closeCode = !parser.eof();
		var closeMode = tags.pop();
		var oldMode = closeMode && endMode();
		inheritance.pop();
		if(closeCode) source.push("})");
		if(oldMode) oldMode.finalize();
		if(closeCode) {
			source.push(closing.pop());
			addSemicolon();
		}
	}

	function parseCode(input, parentParser) {
		var cparser = new Parser(input, (parentParser || parser).position);
		var source = [];
		var mode = Sactory.startMode(defaultMode, options.namespace, cparser, element, source);
		mode.start();
		while(cparser.index < input.length) {
			mode.parse(function(){ source.push('<'); }, function(){}, parseCode);
		}
		mode.end();
		mode.finalize();
		source = source.join("");
		return {
			source: source,
			observables: mode.observables,
			toValue: function(){
				if(mode.observables && mode.observables.length) {
					if(input.charAt(0) == '*' && source == input.substr(1) + ".value") {
						// single observable, pass it raw so it can be used in two-way binding
						return input.substr(1);
					} else {
						return "{observe:[" + mode.observables.join(',') + "],compute:function(){return " + source + "}}";
					}
				} else {
					return source;
				}
			}
		};
	}

	function wrapFunction(value) {
		if(value.charAt(0) == '{' && value.charAt(value.length - 1) == '}') {
			return "function(" + Array.prototype.slice.call(arguments, 1).join(", ") + "){return " + value.substring(1, value.length - 1) + "}";
		} else {
			return value;
		}
	}
	
	while(parser.index < input.length) {
		currentMode.parser.parse(function(){
			if(parser.peek() == '/') {
				parser.find(['>'], true, false); // skip until closed
				close();
			} else if(parser.peek() == '!') {
				parser.index++;
				parser.expect('-');
				parser.expect('-');
				var seq = parser.findSequence("-->", true);
				source.push("Sactory.comment(" + element + ", " + bind + ", " + anchor + ", " + JSON.stringify(seq) + ");");
				for(var i=0; i<seq.length; i++) {
					if(seq.charAt(i) == '\n') source.push('\n');
				}
			} else if(currentMode.options.children === false) {
				throw new Error("Mode " + currentMode.name + " cannot have children");
			} else {
				function skip() {
					parser.skipImpl({comments: true, strings: false}); // before/after attributes
				}
				var currentIndex = source.length;
				var newMode = undefined;
				var create = true; // whether a new element is being created or the current element is being scoped
				var append = true; // whether the new element should be appended to the current element after its creation
				var unique = false; // whether the new element should be appended always or only when its not already on the DOM
				var parent = element; // element that the new element will be appended to, if not null
				var iattributes = {}; // attributes used to give instructions to the transpiler, not used at runtime
				var rattributes = []; // attributes used at runtime to modify the element
				var sattributes = ""; // variable name of the attributes passed using the spread syntax
				var computed = false;
				var selector, tagName;
				if(selector = parser.readQueryExpr()) {
					selector = parseCode(selector).source;
					tagName = parser.peek() == '$' && parser.readTagName(true) || "";
					append = false;
				} else if(tagName = parser.readComputedExpr()) {
					tagName = parseCode(tagName).source;
					computed = true;
				} else {
					tagName = parser.readTagName(true);
				}
				skip();
				var next = false;
				while(!parser.eof() && (next = parser.peek()) != '>' && next != '/') {
					if(next == '.') {
						parser.index++;
						parser.expect('.');
						parser.expect('.');
						sattributes = parser.readExpr();
					} else {
						var attr = {
							attr: undefined,
							computed: false,
							value: "\"\""
						};
						var add = false;
						//skip();
						if(attr.attr = parser.readComputedExpr()) {
							attr.attr = parseCode(attr.attr).source;
							attr.computed = add = true;
						} else {
							attr.attr = parser.readAttributeName(true);	
						}
						skip();
						if(parser.peek() == '=') {
							parser.index++;
							skip();
							var value = parser.readAttributeValue();
							if(attr.attr.charAt(0) == '@' || attr.attr.charAt(0) == '+') {
								value = wrapFunction(value, "event");
							} else if(attr.attr == ":change") {
								value = wrapFunction(value, "oldValue", "value");
							} else if(attr.attr == ":cleanup" || attr.attr == ":condition") {
								value = wrapFunction(value);
							}
							attr.value = parseCode(value).toValue();
						}
						if(!attr.computed) {
							if(attr.attr == "@") {
								parent = attr.value;
							} else if(attr.attr.charAt(0) == '#') {
								newMode = modeNames[attr.attr.substr(1)];
							} else if(attr.attr.charAt(0) == ':') {
								iattributes[attr.attr.substr(1)] = attr.value;
							} else {
								add = true;
							}
						}
						if(add) {
							rattributes.push(attr);
						}
					}
					skip();
					next = false;
				}
				if(!next) throw new Error("Tag was not closed");
				if(!computed) {
					if(tagName.charAt(0) == ':') {
						create = false;
						switch(tagName.substr(1)) {
							case "head":
							case "body":
								parent = "document." + tagName.substr(1);
								break;
						}
					} else if(tagName.charAt(0) == '#') {
						newMode = modeNames[tagName.substr(1)];
						if(newMode !== undefined) create = false; // behave as a scope
					} else if(tagName.charAt(0) == '@') {
						append = false;
						tagName = tagName.substr(1);
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
				if(iattributes.head) parent = "document.head";
				if(iattributes.body) parent = "document.body";
				var currentInheritance = "";
				var currentClosing = "";
				function createExpr() {
					var ret = "Sactory.";
					if(!append) ret += "updateElement(" + element + ", ";
					else ret += "createElement(";
					ret += (computed ? tagName : '"' + tagName + '"') + ", [" + inheritance.join("");
					rattributes.forEach(function(attribute){
						if(!attribute.computed && attribute.attr.charAt(0) == '~') {
							var expr = "{key:\"" + attribute.attr.substr(1) + "\",value:" + attribute.value + "},";
							currentInheritance += expr;
							ret += expr;
						} else {
							ret += "{key:" + (attribute.computed ? attribute.attr : '"' + attribute.attr + '"') + ",value:" + attribute.value + "},";
						}
					});
					return ret + "]" + (sattributes && ", " + sattributes) + ")";
				}
				parser.index++;
				if(parent == "\"\"") {
					// an empty string and null have the same behaviour but null is faster as it avoids the query selector controls when appending
					parent = "null";
				}
				if(selector) {
					source.push("Sactory.query(this, " + selector + ", function(" + element + "){");
					currentClosing += "})";
				}
				if(next == '/') {
					parser.expect('>');
					if(create) {
						if(append) {
							var e = "Sactory.appendElement(" + parent + ", " + bind + ", " + anchor + ", " + createExpr() + ")";
							if(iattributes.unique) e = "Sactory.unique(this, " + nextId(true) + ", function(){return " + e + "})";
							source.push(e);
						} else {
							source.push(createExpr());
						}
					} else {
						source.push(parent);
					}
					if(currentClosing) source.push(currentClosing);
					addSemicolon();
				} else {
					var expr = createExpr(); // always call to trigger attribute inheritance
					tags.push(newMode !== undefined);
					if(newMode !== undefined) {
						startMode(newMode, iattributes);
					}
					var bindType = "";
					if(tagName == ":bind-if" || tagName == ":if") bindType = "If";
					else if(tagName == ":bind-each" || tagName == ":each") bindType = "Each";
					if(!computed && (bindType || tagName == ":bind")) {
						source.push("Sactory.bind" + bindType + "(" + ["this", parent, bind, anchor, iattributes.to || "0", iattributes.change || "0", iattributes.cleanup || "0"].join(", ") + (bindType == "If" ? ", " + iattributes.condition : "") +
							", function(" + [element, bind, anchor, iattributes.as || "__" + nextId(), iattributes.index || "__" + nextId(), iattributes.array || "__" + nextId()].join(", ") + "){");
					} else if(create) {
						if(append) {
							var e = "Sactory.append(" + parent + ", " + bind + ", " + anchor + ", Sactory.call(this, " + expr + ", function(" + element + ", " + anchor + "){";
							currentClosing += ")";
							if(iattributes.unique) {
								e = "Sactory.unique(this, " + nextId(true) + ", function(){return " + e;
								currentClosing += "})";
							}
							source.push(e);
						} else {
							source.push("Sactory.call(this, " + expr + ", function(" + element + "){");
						}
					} else {
						source.push("Sactory.callElement(this, " + parent + ", function(" + element + "){");
					}
					inheritance.push(currentInheritance);
					closing.push(currentClosing);
					if(newMode !== undefined) {
						currentMode.parser.start();
					}
				}
			}
			parser.last = undefined;
		}, close, parseCode);
	}
	
	endMode().finalize();
	
	source.push("})(typeof global=='object'&&global.Sactory||typeof window=='object'&&window.Sactory||require('sactory'), " + (options.scope || 0) + ", 0, 0);");
	
	//console.log(source.join(""));
	
	return {
		element: element,
		bind: bind,
		anchor: anchor,
		source: source.join("")
	};
	
};

if(typeof window == "object") {

	function evalScripts() {
		Array.prototype.forEach.call(document.querySelectorAll("script[type='text/x-builder'], style[type='text/x-builder']"), function(builder){
			var id = Util.nextId();
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
			script.textContent = Sactory.convertSource(content || builder.textContent, {}).source;
			document.head.appendChild(script);
		});
	}
	
	if(document.readyState == "complete") {
		evalScripts();
	} else {
		window.addEventListener("load", evalScripts);
	}
	
}

module.exports = Sactory;
	