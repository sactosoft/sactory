var Polyfill = require("./polyfill");
var Util = require("./util");
var Parser = require("./parser");

require("./document"); // init global variables

var Factory = {};

var modeRegistry = [];
var modeNames = {};
var defaultMode;

/**
 * @since 0.15.0
 */
Factory.registerMode = function(displayName, names, parser, options){
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
Factory.startMode = function(mode, namespace, parser, element, source, attributes){
	var m = modeRegistry[mode];
	return m && new m.parser({info: m.info, namespace: namespace || "", parser: parser, element: element || "", source: source || []}, attributes || {});
};

/**
 * @since 0.35.0
 */
Factory.startModeByName = function(mode, namespace, parser, element, source, attributes){
	return Factory.startMode(modeNames[mode], namespace, parser, element, source, attributes);
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

SourceParser.prototype.parse = function(handle, eof){};

/**
 * @class
 * @since 0.29.0
 */
function BreakpointParser(data, attributes, breakpoints) {
	SourceParser.call(this, data, attributes);
	this.breakpoints = ['<'].concat(breakpoints);
}

BreakpointParser.prototype = Object.create(SourceParser.prototype);

BreakpointParser.prototype.next = function(match){};

BreakpointParser.prototype.parse = function(handle, eof){
	var result = this.parser.find(this.breakpoints, false, true);
	if(result.pre) this.add(result.pre);
	if(result.match == '<') {
		if(this.info.options.code && [undefined, '(', '[', '{', '}', ';', ':', ',', '=', '/', '?', '&', '|', '>'].indexOf(this.parser.last) == -1) {
			// just a comparison
			this.add("<");
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

TextParser.prototype.parse = function(handle, eof){
	var result = this.parser.find(['<', '$']);
	if(result.pre) {
		this.add(this.element + ".__builder.text=" + JSON.stringify(this.replaceText(result.pre)).replace(/\\n/gm, "\\n\" +\n\"") + ";");
	}
	switch(result.match) {
		case '$':
			this.add(this.element + ".__builder.text=" + this.parser.readVar(true) + ";");
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
	BreakpointParser.call(this, data, attributes, ['@']);
}

JavascriptParser.prototype = Object.create(BreakpointParser.prototype);

JavascriptParser.prototype.next = function(match){
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
			if(this.parser.input.substr(this.parser.index).search(/^text[\s]*=/) === 0) this.add(".__builder.");
			else if(this.parser.peek().search(/[a-zA-Z0-9_]/) === 0) this.add(".");
		}
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

HTMLParser.prototype.replaceText = function(text){
	var textarea = document.createElement("textarea");
	textarea.innerHTML = text;
	return textarea.value;
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
	this.scopes = ["__s" + Util.nextId(this.namespace)];
	this.scope = attributes.scoped && "__style" + Util.nextId(this.namespace);
}

CSSBParser.prototype = Object.create(SourceParser.prototype);

CSSBParser.prototype.addScope = function(selector){
	var scope = "__s" + Util.nextId(this.namespace);
	this.add("var " + scope + "=" + this.scopes[this.scopes.length - 1] + "[" + selector + "]={};");
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
	this.add("var " + this.scopes[0] + "={};");
	if(this.scope) {
		this.addScope("\".__style\"+" + this.element + ".__builder.id");
	}
};

CSSBParser.prototype.parse = function(handle, eof){
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
		if(this.parser.peek() != '(') throw new Error("Expected '(' after statement (if/else if/for/while).");
		var start = this.parser.index;
		this.parser.skipExpr();
		this.add(this.parser.input.substring(start, this.parser.index));
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
		this.add(CSSBParser.createExpr(this.parser.find([';'], true, true).pre, this.namespace) + ';');
	} else {
		var namespace = this.namespace;
		function value(e, computable) {
			if(e.length && e[0].string && (e[0].value = Polyfill.trimStart.call(e[0].value)).length == 0) e.shift();
			if(e.length && e[e.length - 1].string && (e[e.length - 1].value = Polyfill.trimEnd.call(e[e.length - 1].value)).length == 0) e.pop();
			if(e.length) {
				var ret = [];
				e.forEach(function(v){
					ret.push(v.string && JSON.stringify(v.value) || (!computable && v.value || CSSBParser.createExpr(v.value, namespace)));
				});
				return ret.join('+');
			} else {
				return "\"\"";
			}
		}
		var search = ['<', '$', '{', '}', ';', ':'];
		var expr = {key: [], value: []};
		var curr = expr.key;
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
					this.add(this.scopes[this.scopes.length - 1] + "[" + value(expr.key) + "]=" + (expr.value.length && value(expr.value, true) || null) + ";");
					break;
				default:
					eof();
			}
		} while(loop);
	}
};

CSSBParser.prototype.end = function(){
	this.add(this.element + ".textContent=Factory.compilecssb(" + this.scopes[0] + ");");
};

CSSBParser.prototype.finalize = function(){
	if(this.scope) this.add(", function(){ this.parentNode.classList.add(\"__style\" + this.__builder.id); }, function(){ this.parentNode.classList.remove(\"__style\" + this.__builder.id); }");
};

CSSBParser.createExprImpl = function(expr, info){
	var parser = new Parser(expr);
	function skip() {
		var skipped = parser.skipImpl({strings: false, comments: true});
		if(skipped) info.computed += skipped;
	}
	function readSign() {
		var result = parser.readImpl(/^((\+\+?)|(\-\-?))/, false);
		if(result) info.computed += result;
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
				info.computed += "Factory.unit(" + info.param + "," + v + ")";
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
	var param = "__u" + Util.nextId(namespace);
	var info = {
		param: param,
		computed: "(function(" + param + "){return Factory.compute(" + param + ",",
		is: false,
		op: 0
	};
	return CSSBParser.createExprImpl(expr, info) && info.is && info.op && (info.computed + ")})({})") || expr;
};

Factory.registerMode("Javascript", ["javascript", "js", "code"], JavascriptParser, {isDefault: true, code: true});
Factory.registerMode("HTML", ["html"], HTMLParser, {comments: false, strings: false});
Factory.registerMode("Text", ["text"], HTMLParser, {comments: false, strings: false, children: false});
Factory.registerMode("Script", ["script"], ScriptParser, {comments: false, strings: false, children: false, tags: {"script": []}});
Factory.registerMode("CSS", ["css"], CSSParser, {children: false});
Factory.registerMode("CSSB", ["cssb", "style", "fcss"], CSSBParser, {strings: false, children: false, tags: {"style": ["scoped"]}});

Factory.convertSource = function(input, options){
	
	var parser = new Parser(input);
	
	var element = "__el" + Util.nextId(options.namespace);
	
	var source = ["(function(Factory, " + element + "){"];
	
	var tags = [];
	var inheritance = [];
	var closing = [];
	var modes = [];
	var currentMode;
	var valueParser = Factory.startMode(defaultMode, options.namespace, null, element);
	
	function parseValue(value) {
		valueParser.parser = new Parser(value);
		valueParser.source = [];
		valueParser.parse();
	}
	
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
				source.push(element + ".appendChild(document.createComment(" + JSON.stringify(seq) + "));");
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
				var iattributes = {};
				var rattributes = [];
				var selector, tagName;
				if(selector = parser.readComputedExpr()) {
					tagName = parser.peek() == '$' && parser.readTagName(true) || "";
					append = false;
				} else {
					tagName = parser.readTagName(true);
				}
				skip();
				var next = false;
				while(!parser.eof() && (next = parser.peek()) != '>' && next != '/') {
					skip();
					var attr = parser.readComputedExpr() || parser.readAttributeName(true);
					var value;
					skip();
					if(parser.peek() == '=') {
						parser.index++;
						skip();
						value = parser.readAttributeValue();
					} else {
						value = "\"\"";
					}
					if(attr == "@") {
						parent = value;
					} else if(attr == "*unique") {
						unique = true;
					} else if(attr == "*head" || attr == "*body") {
						parent = "document." + attr.substr(1);
					} else if(attr.charAt(0) == '#') {
						newMode = modeNames[attr.substr(1)];
					} else if(attr.charAt(0) == ':') {
						iattributes[attr.substr(1)] = value;
					} else {
						rattributes.push({attr: attr, value: value});
					}
					skip();
					next = false;
				}
				if(!next) throw new Error("Tag was not closed");
				if(tagName.charAt(0) == ':') {
					switch(tagName.substr(1)) {
						case "":
						case "scope":
							create = false;
							break;
					}
				} else if(tagName.charAt(0) == '#') {
					newMode = modeNames[tagName.substr(1)];
					if(newMode !== undefined) create = false; // behave as a scope
				} else if(tagName.charAt(0) == '&') {
					append = false;
					tagName = tagName.substr(1);
				} else if(tagName == "*head" || tagName == "*body") {
					create = false;
					parent = "document." + tagName.substr(1);
				}
				if(newMode === undefined) {
					for(var i=0; i<modeRegistry.length; i++) {
						var info = modeRegistry[i];
						var attr = info.options.tags && info.options.tags[tagName];
						if(attr) {
							newMode = i;
							// transfer runtime attributes to interpreter attributes
							rattributes.forEach(function(a, i){
								if(attr.indexOf(a.attr) != -1) {
									iattributes[a.attr] = a.value;
									rattributes.splice(i, 1);
								}
							});
							break;
						}
					}
				}
				var currentInheritance = "";
				var currentClosing = "";
				function createExpr() {
					var ret = "Factory.";
					if(!append) ret += "updateElement(" + element + ", ";
					else ret += "createElement(";
					ret += "\"" + tagName + "\", [" + inheritance.join("");
					function stringifyKey(key) {
						if(key.charAt(0) == '[' && key.charAt(key.length - 1) == ']') return key.substring(1, key.length - 1);
						else return '"' + key + '"';
					}
					rattributes.forEach(function(attribute){
						if(attribute.attr.charAt(0) == '~') {
							var nkey = attribute.attr.substr(1);
							var expr = "{key:" + stringifyKey(nkey) + ",value:" + attribute.value + "},";
							currentInheritance += expr;
							ret += expr;
						} else {
							ret += "{key:" + stringifyKey(attribute.attr) + ",value:" + attribute.value + "},";
						}
					});
					return ret + "])";
				}
				parser.index++;
				if(selector) {
					source.push("Factory.query(this, " + selector + ", function(" + element + "){");
					currentClosing += "})";
				}
				if(next == '/') {
					parser.expect('>');
					if(create) {
						if(append) {
							var e = "Factory.appendElement(" + parent + ", " + createExpr() + ")";
							if(unique) e = "Factory.unique(this, " + Util.nextId(options.namespace) + ", function(){return " + e + "})";
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
					if(tagName == ":bind") {
						source.push("Factory.bind(this, " + parent + ", " + iattributes.to + ", " + iattributes.change + ", function(" + element + (iattributes.as ? ", " + iattributes.as : "") + "){");
					} else if(create) {
						if(append) {
							var e = "Factory.append(" + parent + ", Factory.call(this, " + expr + ", function(" + element + "){";
							currentClosing += ")";
							if(unique) {
								e = "Factory.unique(this, " + Util.nextId(options.namespace) + ", function(){return " + e;
								currentClosing += "})";
							}
							source.push(e);
						} else {
							source.push("Factory.call(this, " + expr + ", function(" + element + "){");
						}
					} else {
						source.push("Factory.callElement(this, " + parent + ", function(" + element + "){");
					}
					inheritance.push(currentInheritance);
					closing.push(currentClosing);
					if(newMode !== undefined) {
						currentMode.parser.start();
					}
				}
			}
			parser.last = undefined;
		}, close);
	}
	
	endMode().finalize();
	
	source.push("})(typeof global=='object'&&global.Factory||typeof window=='object'&&window.Factory||require('factory'), " + (options.scope || null) + ");");
	
	console.log(source.join(""));
	
	return source.join("");
	
};

if(typeof window == "object") {

	function evalScripts() {
		Array.prototype.forEach.call(document.querySelectorAll("script[type='text/x-builder'], style[type='text/x-builder']"), function(builder){
			var content;
			if(builder.tagName == "STYLE") {
				builder.removeAttribute("type");
				content = builder.outerHTML;
				builder.setAttribute("type", "text/x-builder");
			}
			eval.call(window, Factory.convertSource(content || builder.textContent, {}));
		});
	}
	
	if(document.readyState == "complete") {
		evalScripts();
	} else {
		window.addEventListener("load", evalScripts);
	}
	
}

module.exports = Factory;
	