var Polyfill = require("../polyfill");
var Parser = require("./parser");
var { uniq, stringify } = require("./util");

var modeRegistry = [];
var modeNames = {};
var defaultMode;

/**
 * @since 0.15.0
 */
function defineMode(names, parser, isDefault) {
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
}

/**
 * @since 0.53.0
 */
function getModeByName(name) {
	return modeNames[name];
}

/**
 * @since 0.35.0
 */
function startMode(mode, transpiler, parser, source, attributes, parent) {
	var m = modeRegistry[mode];
	var ret = new m.parser(transpiler, parser, source, attributes || {}, parent);
	ret.options = parser.options = m.parser.getOptions();
	return ret;
}

/**
 * @class
 * @since 0.15.0
 */
function Mode(transpiler, parser, source, attributes) {
	this.transpiler = transpiler;
	this.parser = parser;
	this.source = source;
	this.runtime = transpiler.runtime;
	this.arguments = transpiler.arguments;
	this.context = transpiler.context;
	this.es6 = transpiler.options.es6;
	this.attributes = attributes;
}

Mode.prototype.add = function(text){
	return this.source.push(text);
};

/**
 * @since 0.69.0
 */
Mode.prototype.parseCode = function(fun){
	this.parser.parseTemplateLiteral = null;
	var expr = Parser.prototype[fun].apply(this.parser, Array.prototype.slice.call(arguments, 1));
	this.transpiler.updateTemplateLiteralParser();
	return this.transpiler.parseCode(expr, this.parser);
};

Mode.prototype.parseCodeToSource = function(fun){
	var expr = Parser.prototype[fun].apply(this.parser, Array.prototype.slice.call(arguments, 1));
	return this.transpiler.parseCode(expr, this.parser).source;
};

Mode.prototype.parseCodeToValue = function(fun){
	return this.parseCode.apply(this, arguments).toValue();
};

Mode.prototype.start = function(){};

Mode.prototype.end = function(){};

Mode.prototype.chainAfter = function(){};

Mode.prototype.parse = function(handle, eof){};

/**
 * @class
 * @since 0.29.0
 */
function BreakpointMode(transpiler, parser, source, attributes, breakpoints) {
	Mode.call(this, transpiler, parser, source, attributes);
	this.breakpoints = ['<'].concat(breakpoints);
}

BreakpointMode.prototype = Object.create(Mode.prototype);

BreakpointMode.prototype.next = function(match){};

BreakpointMode.prototype.parse = function(handle, eof){
	var result = this.parser.find(this.breakpoints, false, true);
	if(result.pre) this.add(result.pre);
	if(result.match == '<') {
		if(this.parser.couldStartRegExp() && this.parser.input.charAt(this.parser.index - 2) != '<') {
			handle();
		} else {
			// just a comparison or left shift
			this.add("<");
			this.parser.last = '<';
			this.parser.lastIndex = this.parser.index;
		}
	} else if(result.match) {
		this.next(result.match);
	} else {
		eof();
	}
};

/**
 * Basic parser that recognises text, expressions (both textual and mixin)
 * and new tags.
 * @class
 * @since 0.28.0
 */
function TextExprMode(transpiler, parser, source, attributes) {
	Mode.call(this, transpiler, parser, source, attributes);
	this.current = [];
	this.chain = [];
	this.chainable = true;
}

TextExprMode.prototype = Object.create(Mode.prototype);

/**
 * Adds text to the chain.
 */
TextExprMode.prototype.addText = function(expr){
	this.chain.push(["text", expr]);
};

/**
 * Adds whitespace to the chain.
 */
TextExprMode.prototype.addSpace = function(space){
	this.chain.push([, space]);
};

/**
 * Parses and adds the current text to the chain.
 */
TextExprMode.prototype.addCurrent = function(){
	if(this.attributes.trimmed && this.current.length == 1 && this.current[0].text && /^\s*$/.test(this.current[0].value)) {
		// just whitespace
		this.addSpace(this.current[0].value);
	} else {
		var expr = this.current.filter(c => !c.text || c.value.length);
		if(expr.length) {
			// create joined
			var joined = this.es6 ?
				`\`${expr.map(({text, value}) => text ? this.replaceText(value).replace(/(`|\$|\\)/gm, "\\$1") : "${" + value.source + "}").join("")}\`` :
				`"" + ${expr.map(({text, value}) => text ? stringify(this.replaceText(value)) : `(${value.source})`).join(" + ")}`;
			// collect observables
			var observables = [];
			var maybeObservables = [];
			expr.forEach(({text, value}) => {
				if(!text) {
					observables.push(...value.observables);
					maybeObservables.push(...value.maybeObservables);
				}
			});
			if(observables.length || maybeObservables.length) {
				joined = `${this.transpiler.feature("bo")}(${this.es6 ? `() => ${joined}` : `function(){return ${joined}}.bind(this)`}, [${uniq(observables).join(", ")}]${maybeObservables.length ? `, [${uniq(maybeObservables).join(", ")}]` : ""})`
			}
			this.addText(joined);
		}
	}
	this.current = [];
};

/**
 * Closes the current chain. Either because a new tag is being opened
 * or because or a non-chainable operation is being started.
 * @since 0.128.0
 */
TextExprMode.prototype.endChain = function(){
	this.addCurrent();
	// add compiled data to source
	var source = "";
	var empty = true;
	this.chain.forEach(data => {
		var type = data.shift();
		if(type) {
			// text or mixin
			empty = false;
			source += `, [${this.transpiler.chainFeature(type)}, ${data.join("")}]`;
		} else {
			// whitespace
			source += data[0];
		}
	});
	if(!empty) {
		this.source.addSource(`${this.transpiler.chain}(`);
		this.source.addContext();
		this.source.addSource(`${source});`);
	} else {
		this.source.addSource(source);
	}
	this.chain = [];
};

/**
 * Closes the current chain and indicates that the whole parses cannot be used
 * as a single chain no more.
 */
TextExprMode.prototype.endChainable = function(){
	this.endChain();
	this.chainable = false;
};

/**
 * @deprecated
 */
TextExprMode.prototype.addFinalCurrent = function(){
	this.endChain();
};

/**
 * Adds text to the current data.
 */
TextExprMode.prototype.pushText = function(value){
	var last = this.current[this.current.length - 1];
	if(last && last.text) last.value += value;
	else this.current.push({text: true, value: value});
};

/**
 * Adds a code expression to the current data.
 */
TextExprMode.prototype.pushExpr = function(value){
	this.current.push({text: false, value: value});
};

/**
 * Removes whitespaces from the end of the current data.
 * @returns The trimmed text.
 */
TextExprMode.prototype.trimEnd = function(){
	var ret = "";
	var end = this.current[this.current.length - 1];
	if(end.text) {
		var trimmed = Polyfill.trimEnd.call(end.value);
		ret = end.value.substr(trimmed.length);
		end.value = trimmed;
	}
	return ret;
};

TextExprMode.prototype.replaceText = function(text){
	return text;
};

TextExprMode.prototype.handle = function(){
	return true;
};

TextExprMode.prototype.parseImpl = function(pre, match, handle, eof){
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
					this.chain.push(["mixin", expr.source]);
				} else {
					this.pushExpr(expr);
				}
			} else {
				this.pushText(match);
			}
			break;
		case '<':
			if(this.handle()) {
				if(this.parser.peek() == "/") {
					// tag is being closed, chainable is not modified
					this.endChain();
				} else {
					// another tag is being opened, cannot chain
					this.endChainable();
				}
				handle();
			} else {
				this.pushText('<');
			}
			break;
		default:
			this.endChain();
			eof();
	}
};

TextExprMode.prototype.parse = function(handle, eof){
	var result = this.parser.find(['<', '$', '#'], false, true);
	this.pushText(result.pre);
	this.parseImpl(result.pre, result.match, handle, eof);
};

/**
 * @class
 * @since 0.53.0
 */
function LogicMode(transpiler, parser, source, attributes) {
	TextExprMode.call(this, transpiler, parser, source, attributes);
	this.count = 0;
	this.statements = [];
	this.popped = [];
}

LogicMode.prototype = Object.create(TextExprMode.prototype);

LogicMode.prototype.getLineText = function(){
	var last = this.current[this.current.length - 1];
	if(last.text) {
		var index = last.value.lastIndexOf('\n');
		if(index > 0) return last.value.substr(index);
		else return last.value;
	} else {
		return "";
	}
};

LogicMode.prototype.parseLogic = function(expected, type, closing){
	var line;
	if(
		this.parser.input.substr(this.parser.index, expected.length - 1) == expected.substr(1) && // when the expected keyword is found
		!/\S/.test(line = this.getLineText()) && // and when it is at the start of line
		!/[a-zA-Z0-9_$]/.test(this.parser.input.charAt(this.parser.index + expected.length - 1)) // and when it is an exact keyword
	) {
		this.parser.index += expected.length - 1;
		var trimmed = this.trimEnd();
		this.endChainable();
		this.add(trimmed);
		if(type === 0) {
			// variable
			this.endChainable(); // variable declarations cannot be chained
			var end = this.parser.find(closing || ['=', ';'], true, {comments: true, strings: false});
			this.add(expected + end.pre + end.match); // add declaration (e.g. `var a =` or `var a;`)
			if(end.match == '=') {
				this.add(this.transpiler.parseCode(this.parser.readExpression()).source); // add the value/body of the variable
				if(this.parser.readIf(';')) this.add(';');
			}
		} else {
			// statement
			var statement = Polyfill.startsWith.call(expected, "else") ? this.popped.pop() : {
				type: expected,
				startRef: this.source.addIsolatedSource(""),
				context: this.source.getContextArg(),
				observables: [],
				maybeObservables: [],
				inlineable: true,
				end: "",
				parts: [],
				ref: {}
			};
			var part = {
				type: expected,
				observables: [],
				maybeObservables: [],
				declStart: this.source.addIsolatedSource("")
			};
			statement.parts.push(part);
			if(type === 1) {
				// with condition (e.g. `statement(condition)`)
				var reparse = (source, parser) => {
					var parsed = this.transpiler.parseCode(source, parser);
					statement.observables.push(...parsed.observables);
					statement.maybeObservables.push(...parsed.maybeObservables);
					part.observables.push(...parsed.observables);
					part.maybeObservables.push(...parsed.maybeObservables);
					return parsed.source;
				};
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
						var column = rest.indexOf(":");
						if(column == -1) {
							// divided in 4 parts so it can be modified later
							statement.ref.a = this.source.addIsolatedSource(this.transpiler.feature("forEachArray") + "(")
							statement.ref.b = this.source.addIsolatedSource(expr);
							if(this.es6) {
								statement.ref.c = this.source.addIsolatedSource(", (");
								this.source.addIsolatedSource(rest + ") =>");
							} else {
								statement.ref.c = this.source.addIsolatedSource(", function(");
								this.source.addIsolatedSource(rest + ")");
							}
						} else {
							// object
							statement.type = part.type = "object-foreach";
							rest = rest.substring(0, column) + "," + rest.substr(column + 1);
							this.source.addSource(`${this.transpiler.feature("forEachObject")}(${expr}, ${this.es6 ? `(${rest}) =>` : `function(${rest})`}`);
						}
					} else {
						statement.type = part.type = "range";
						this.source.addSource(`${this.transpiler.feature("range")}(${from}, ${to}, ${this.es6 ? `(${rest}) =>` : `function(${rest})`}`);
					}
					if(!this.es6) statement.end += ".bind(this)";
					statement.end += ");";
					statement.inlineable = false;
				} else {
					part.decl = this.source.addIsolatedSource(expected + skipped + source);
				}
			} else {
				// without condition
				this.source.addSource(expected);
			}
			this.source.addSource(this.parser.skipImpl({}));
			if(!(statement.inline = part.inline = !this.parser.readIf('{')) || !statement.inlineable) this.source.addSource('{');
			part.declEnd = this.source.addIsolatedSource("");
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

LogicMode.prototype.find = function(){
	return this.parser.find(['$', '#', '<', 'c', 'l', 'v', 'b', 'd', 'i', 'e', 'f', 'w', 's', '}', '\n'], false, false);
};

LogicMode.prototype.parse = function(handle, eof){
	var result = this.find();
	this.pushText(result.pre);
	switch(result.match) {
		case 'c':
			if(!this.parseLogic("const", 0) && !this.parseLogic("case", 0, [':'])) this.pushText('c');
			break;
		case 'l':
			if(!this.parseLogic("let", 0)) this.pushText('l');
			break;
		case 'v':
			if(!this.parseLogic("var", 0)) this.pushText('v');
			break;
		case 'b':
			if(!this.parseLogic("break", 0)) this.pushText('b');
			break;
		case 'd':
			if(!this.parseLogic("default", 0, [':'])) this.pushText('d');
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
		case 's':
			if(!this.parseLogic("switch", 1)) this.pushText('s');
			break;
		case '}':
			if(result.pre.slice(-1) == '\\') {
				var curr = this.current[this.current.length - 1];
				curr.value = curr.value.slice(0, -1) + '}';
			} else if(this.statements.length) {
				var trimmed = this.trimEnd();
				this.endChainable();
				this.source.addSource(trimmed);
				var statement = this.statements.pop();
				statement.endRef = statement.parts[statement.parts.length - 1].close = this.source.addIsolatedSource("}");
				this.popped.push(statement);
				this.onStatementEnd(statement);
			} else {
				this.pushText('}');
			}
			break;
		case '\n':
			if(this.statements.length && this.statements[this.statements.length - 1].inline) {
				var trimmed = this.trimEnd();
				this.endChainable();
				this.add(trimmed);
				this.add('\n');
				var statement = this.statements.pop();
				if(!statement.inlineable) this.source.addSource("}");
				statement.endRef = statement.parts[statement.parts.length - 1].close = this.source.addIsolatedSource("");
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

LogicMode.prototype.onStatementStart = function(statement){};

LogicMode.prototype.onStatementEnd = function(statement){};

LogicMode.prototype.end = function(){
	this.popped.forEach(popped => {
		var bind = !!popped.observables.length || !!popped.maybeObservables.length;
		if(popped.end.length) {
			// prepend end if needed
			popped.endRef.value += popped.end;
		}
		if(bind) {
			if(popped.type == "if") {
				// calculate conditions and remove them from source
				var conditions = [];
				var replacement = this.es6 ? `, ${popped.context} =>` : `, function(${popped.context})`;
				popped.parts.forEach(part => {
					var source = part.decl.value.substr(part.type.length);
					if(part.type == "else") {
						conditions.push("[]");
					} else {
						var condition = this.es6 ? `() => ${source}` : `function(){return ${source}}.bind(this)`;
						conditions.push(`[${condition}, [${uniq(part.observables)}]${part.maybeObservables.length ? `, [${uniq(part.maybeObservables)}]` : ""}]`);
					}
					part.declStart.value = replacement;
					if(part.inline) {
						part.declStart.value += "{";
						part.close.value += "}";
					}
					part.decl.value = "";
				});
				popped.startRef.value = `${this.transpiler.feature("bindIfElse")}(${popped.context}, [${conditions.join(", ")}]${popped.startRef.value}`;
				popped.endRef.value += `${this.es6 ? "" : ".bind(this)"});`;
			} else if(popped.type == "foreach") {
				// the source is divided in 4 parts
				var expr = popped.ref.b.value;
				var getter = this.es6 ? `() => ${expr}` : `function(){return ${expr}}.bind(this)`;
				var maybe = !!popped.maybeObservables.length;
				popped.ref.a.value = "";
				popped.ref.b.value = "";
				popped.ref.c.value = `${this.transpiler.feature("bindEach" + (maybe ? "Maybe" : ""))}(${popped.context}, ${(maybe ? popped.maybeObservables : popped.observables)[0]}, ${getter}, ${!this.es6 ? "function" : ""}(${popped.context}, `;
				// no need to close as the end is the same as the Sactory.forEach function call
			} else {
				// normal bind
				var start = `${this.transpiler.feature("bind")}(${popped.context}, [${uniq(popped.observables).join(", ")}], [${popped.maybeObservables.join(", ")}], `;
				var end = "}";
				if(this.es6) {
					start += `${popped.context} => `;
				} else {
					start += `function(${popped.context})`;
					end += ".bind(this)";
				}
				popped.startRef.value = `${start}{${popped.startRef.value}`;
				popped.endRef.value += `${end});`;
			}
		}
	});
};

/**
 * @class
 * @since 0.99.0
 */
function OptionalLogicMode(transpiler, parser, source, attributes) {
	LogicMode.call(this, transpiler, parser, source, attributes);
	if(!attributes.logic) {
		this.parse = TextExprMode.prototype.parse.bind(this);
	}
}

OptionalLogicMode.prototype = Object.create(LogicMode.prototype);

/**
 * @class
 * @since 0.15.0
 */
function SourceCodeMode(transpiler, parser, source, attributes) {
	BreakpointMode.call(this, transpiler, parser, source, attributes, ['(', ')', '{', '}', '$', '&', '*', '^', '=']);
	this.observables = [];
	this.maybeObservables = [];
	this.parentheses = [];
}

SourceCodeMode.getOptions = function(){
	return {isDefault: true, code: true, regexp: true};
};

SourceCodeMode.prototype = Object.create(BreakpointMode.prototype);

SourceCodeMode.prototype.restoreIndex = function(char){
	this.add(this.parser.last = char);
	this.parser.lastIndex = this.parser.index - 1;
};

SourceCodeMode.prototype.handleParenthesis = function(match){
	this.restoreIndex(match);
};

SourceCodeMode.prototype.addObservable = function(observables, maybeObservables, name){
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
		this.add(this.transpiler.feature("value") + "(" + name + ")");
		if(maybeObservables) maybeObservables.push(name);
	} else {
		this.add(name + ".value");
		if(observables) observables.push(name);
	}
	this.parser.last = ')';
	this.parser.lastIndex = this.parser.index;
};

SourceCodeMode.prototype.lookBehind = function(){
	var end = this.parser.lastIndex;
	var index = end;
	while(index >= 0 && /[\s\.a-zA-Z0-9_$]/.test(this.parser.input.charAt(index))) {
		index--;
	}
	return this.parser.input.substring(index + 1, end + 1);
};

/**
 * @since 0.129.0
 */
SourceCodeMode.prototype.searchInSource = function(search){
	var sourceIndex = this.transpiler.source.length - 1;
	var source, index;
	do {
		source = this.transpiler.source[sourceIndex];
		var index = source.lastIndexOf(search);
		if(index != -1) return { source, sourceIndex, index };
	} while(sourceIndex-- > 0);
	return false;
};

/**
 * @since 0.129.0
 */
SourceCodeMode.prototype.injectInSource = function({ source, sourceIndex, index }, str){
	this.transpiler.source[sourceIndex] = source.substring(0, index) + str + source.substr(index);
};

SourceCodeMode.prototype.next = function(match){
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
			this.parser.parentheses.push({
				lastIndex: this.parser.lastIndex,
				start: this.parser.index
			});
			this.handleParenthesis(match);
			break;
		case ')':
			var popped = this.parser.parentheses.pop();
			if(popped) popped.end = this.parser.index;
			this.parser.lastParenthesis = popped;
			this.handleParenthesis(match);
			break;
		case '{':
			var last = this.parser.last;
			var lastIndex = this.parser.lastIndex;
			this.restoreIndex('{');
			if(!this.attributes.inAttr && last == ')' && !this.parser.lastKeywordAtIn(this.parser.lastParenthesis.lastIndex, "if", "else", "for", "while", "do", "switch", "catch", "with")) {
				// new function declaration
				this.source.startFunction();
			} else if(!this.attributes.inAttr && last == '>' && this.parser.input.charAt(lastIndex - 1) == '=') {
				// new arrow function
				this.source.startArrowFunction();
			} else {
				// loop/conditional statement
				this.source.startScope();
			}
			break;
		case '}':
			this.restoreIndex('}');
			this.source.endScope();
			break;
		case '$':
			if(this.parser.readIf('$')) {
				var input = this.parser.input.substr(this.parser.index);
				if(Polyfill.startsWith.call(input, "context")) {
					this.parser.index += 7;
					this.source.addContext();
					this.parser.last = ')';
					return;
				}
				var functions = ["on", "subscribe", "rollback", "bind", "unbind"];
				for(var i in functions) {
					var fname = functions[i];
					if(Polyfill.startsWith.call(input, fname + "(")) {
						this.parser.index += fname.length + 1;
						this.source.addSource(`$$${fname}(`);
						this.source.addContext();
						this.source.addSource(", ");
						this.parser.last = ',';
						return;
					}
				}
				this.restoreIndex('$');
			}
			this.restoreIndex('$');
			break;
		case '&':
			var skip = () => this.parser.skipImpl({strings: false});
			var args = (parsed, async) => {
				if(async) this.add(`.async()`);
				if(parsed.observables.length) {
					this.source.addSource(".d(");
					this.source.addContext();
					this.source.addSource(`, ${uniq(parsed.observables).join(", ")})`);
				}
				if(parsed.maybeObservables.length) {
					this.source.addSource(".m(");
					this.source.addContext();
					this.source.addSource(`, ${uniq(parsed.maybeObservables).join(", ")})`);
				}
			};
			var parseUnwrapped = (space, async) => {
				this.parser.expect('=');
				this.parser.expect('>');
				var parsed = this.transpiler.parseCode(this.parser.readExpression());
				this.add(`${this.transpiler.feature("coff")}(()${space}=>${parsed.source})`);
				args(parsed, async);
			};
			if(this.parser.couldStartRegExp()) {
				var space = skip();
				this.parser.parseTemplateLiteral = null;
				if(this.parser.peek() == '=') {
					// from arrow function not wrapped
					parseUnwrapped(space, false);
				} else if(this.parser.readIf(')')) {
					// from function or wrapped arrow function
					this.add(space);
					var popped = this.parser.parentheses.pop();
					if(popped) popped.end = this.parser.index;
					this.parser.lastParenthesis = popped;
					this.handleParenthesis(')');
					if(popped) {
						// parentheses do match
						var tail = this.source.tail();
						var index;
						var start = popped.start;
						this.add(this.parser.skipImpl({strings: false}));
						if(this.parser.readIf('=')) {
							// arrow function, start is before the open parenthesis
							this.parser.expect('>');
							this.add("=>");
							index = this.parser.index - start;
						} else {
							if(this.parser.lastKeywordAt(popped.lastIndex, "function")) {
								index = this.parser.index - popped.lastIndex + 6;
							} else {
								//TODO skip function name and force previous keyword to be `function`
							}
						}
						tail.value = `${tail.value.slice(0, -index)}${this.transpiler.feature("coff")}(${tail.value.substr(-index)}`;
						// add expression
						var parsed = this.transpiler.parseCode(this.parser.readExpression());
						this.source.addSource(`${parsed.source})`);
						args(parsed, false);
						// inject start
						/*if(inject) {
							// test async
							var async = false;
							if(inject.index == 0) {
								if(inject.sourceIndex > 0) {
									var sourceIndex = inject.sourceIndex - 1;
									var source = this.transpiler.source[sourceIndex];
									async = { source, sourceIndex, index: source.length };
								}
							} else {
								async = inject;
							}
							if(async) {
								// maybe async, search keyword
								var match = async.source.substring(0, async.index).match(/async\s+$/);
								if(match) {
									// the function is async, remove `async` keyword and update index
									this.transpiler.source[async.sourceIndex] = async.source = async.source.substring(0, match.index) + async.source.substr(match.index + 5);
									async.index -= 5;
								} else {
									async = false;
								}
							}
							this.injectInSource(inject, `${this.transpiler.feature("coff")}(`);
							// add expression
							var parsed = this.transpiler.parseCode(this.parser.readExpression());
							this.add(`${parsed.source})`);
							args(parsed, !!async);
						}*/
					}
				}  else {
					// from variable
					var parsed = this.transpiler.parseCode(this.parser.readSingleExpression(true));
					this.add(`${space}${this.transpiler.feature("cofv")}(${parsed.source})`);
				}
				this.transpiler.updateTemplateLiteralParser();
				this.parser.last = ')';
				this.parser.lastIndex = this.parser.index;
			} else if(this.parser.lastKeywordIn("async")) {
				// from arrow variable not wrapped, async
				var data = this.source.tail();

				var index = this.transpiler.source.length - 1;
				var source = this.transpiler.source[index];
				var sub = this.parser.index - this.parser.lastIndex + 3;
				this.transpiler.source[index] = source.slice(0, -sub) + source.slice(-sub + 5);
				parseUnwrapped(skip(), true);
			} else {
				// bitwise or boolean comparator
				this.restoreIndex('&');
				if(this.parser.readIf('&')) this.restoreIndex('&'); // skip to avoid treating it as possible `and`
			}
			break;
		case '*':
			if(this.parser.couldStartRegExp()) {
				if(this.parser.readIf('*')) {
					this.transpiler.warn("The `**value` syntax used to create a new observable does not work anymore. Use `&value` instead.");
					this.add('*');
					this.restoreIndex('*');
				} else {
					// get/set observable
					this.addObservable(this.observables, this.maybeObservables, "");
				}
			} else if(this.parser.last == '.') {
				this.addObservable(this.observables, this.maybeObservables, this.lookBehind());
			} else {
				// just a multiplication or exponentiation
				this.restoreIndex('*');
				if(this.parser.readIf('*')) this.restoreIndex('*'); // exponentiation, skip to avoid trying to treat it as observable
			}
			break;
		case '^':
			if(this.parser.couldStartRegExp()) {
				this.addObservable(null, null, "");
			} else if(this.parser.last == '.') {
				this.addObservable(null, null, this.lookBehind());
			} else {
				// xor operator
				this.restoreIndex('^');
			}
			break;
		case '=':
			if(!this.attributes.inAttr && this.parser.readIf(">")) {
				// it's an arrow function, collect arguments to check what to inject
				this.source.addSource("=>");
				// check whether arguments are wrapped
				var info = {};
				if(this.parser.last == ")") {
					// arguments are wrapped, check whether it's injectable
					info.wrapped = true;
					var tail = this.source.data.pop();
					var open = tail.value.length - (this.parser.index - this.parser.lastParenthesis.start);
					var close = tail.value.length - (this.parser.index - this.parser.lastParenthesis.end) - 1;
					if(open >= 0) {
						this.source.addSource(tail.value.substring(0, open));
						info.data = this.source.addIsolatedSource(tail.value.substring(open, close));
						this.source.addSource(tail.value.substr(close));
					} else {
						// probably a syntax error
						this.source.data.push(tail);
					}
				} else {
					// single argument, not wrapped
					info.wrapped = false;
					var tail = this.source.data.pop();
					var close = tail.value.length - (this.parser.index - this.parser.lastIndex);
					var start = close - 1;
					while(start >= 0 && /[a-zA-Z0-9_$]/.test(tail.value.charAt(start))) start--;
					this.source.addSource(tail.value.substring(0, start + 1));
					info.data = this.source.addIsolatedSource(tail.value.substring(start + 1, close + 1));
					this.source.addSource(tail.value.substr(close + 1));
				}
				this.source.addSource(this.parser.skipImpl({strings: false}));
				if(this.parser.readIf("{")) {
					this.restoreIndex("{");
					this.source.startArrowFunction(info);
				} else {
					// inline arrow function
					//TODO
					this.parser.last = ">";
					this.parser.lastIndex = this.parser.index - 1;
				}
			} else {
				this.restoreIndex('=');
			}
			break;
	}
};

/**
 * @class
 * @since 0.108.0
 */
function AutoSourceCodeMode(transpiler, parser, source, attributes) {
	SourceCodeMode.call(this, transpiler, parser, source, attributes);
}

AutoSourceCodeMode.getOptions = SourceCodeMode.getOptions;

AutoSourceCodeMode.prototype = Object.create(SourceCodeMode.prototype);

/**
 * @class
 * @since 0.15.0
 */
function HTMLMode(transpiler, parser, source, attributes) {
	OptionalLogicMode.call(this, transpiler, parser, source, attributes);
}

HTMLMode.getOptions = function(){
	return {comments: false, strings: false};
};

HTMLMode.prototype = Object.create(OptionalLogicMode.prototype);

HTMLMode.prototype.replaceText = Text.replaceEntities || (function(){
	var converter;
	return function(data){
		if(!converter) converter = document.createElement("textarea");
		converter.innerHTML = data;
		return converter.value;
	}
})();

/**
 * @class
 * @since 0.108.0
 */
function AutoHTMLMode(transpiler, parser, source, attributes, parent) {
	HTMLMode.call(this, transpiler, parser, source, parent && parent.attributes || attributes);
}

AutoHTMLMode.getOptions = HTMLMode.getOptions;

AutoHTMLMode.matchesTag = function(tagName, currentMode){
	return currentMode instanceof AutoSourceCodeMode && tagName != ":debug" && tagName != ":bind";
};

AutoHTMLMode.prototype = Object.create(HTMLMode.prototype);

/**
 * @class
 * @since 0.37.0
 */
function ScriptMode(transpiler, parser, source, attributes) {
	TextExprMode.call(this, transpiler, parser, source, attributes);
}

ScriptMode.getOptions = function(){
	return {comments: false, strings: false, children: false, tags: ["script"]};
};

ScriptMode.prototype = Object.create(TextExprMode.prototype);

ScriptMode.prototype.handle = function(){
	return !!/^\/#?script>/.exec(this.parser.input.substr(this.parser.index));
};

/**
 * @class
 * @since 0.15.0
 */
function CSSMode(transpiler, parser, source, attributes) {
	OptionalLogicMode.call(this, transpiler, parser, source, attributes);
}

CSSMode.getOptions = function(){
	return {comments: true, inlineComments: false, strings: true, children: false};
};

CSSMode.prototype = Object.create(OptionalLogicMode.prototype);

/**
 * @class
 * @since 0.99.0
 */
function SSBMode(transpiler, parser, source, attributes) {
	LogicMode.call(this, transpiler, parser, source, attributes);
	this.observables = [];
	this.maybeObservables = [];
	this.expr = [];
	this.scopes = [transpiler.nextVarName()];
	this.scope = attributes.scope;
	this.scoped = attributes.scoped && transpiler.nextId();
	this.inExpr = false;
}

SSBMode.getOptions = function(){
	return {strings: true, children: false};
};

SSBMode.matchesTag = function(tagName){
	return tagName.toLowerCase() == "style";
};

SSBMode.prototype = Object.create(LogicMode.prototype);

SSBMode.prototype.addScope = function(selector){
	var scope = this.transpiler.nextVarName();
	this.add(`var ${scope}=${this.transpiler.feature("select")}(${this.scopes[this.scopes.length - 1]}, ${selector});`);
	this.scopes.push(scope);
};

SSBMode.prototype.removeScope = function(){
	this.scopes.pop();
};

SSBMode.prototype.skip = function(){
	var skipped = this.parser.skip();
	if(skipped) this.add(skipped);
};

SSBMode.prototype.start = function(){
	var args = this.transpiler.className;
	if(this.attributes.dollar != false) args += ", $";
	this.add(`${this.transpiler.feature("cabs")}(`);
	this.source.addContext();
	this.source.addSource(`, ${this.es6 ? `(${args}) => ` : `function(${args})`}{`);
	this.add(`var ${this.scopes[0]}=${this.transpiler.feature("root")}();`);
	if(this.scoped) this.addScope(this.es6 ? `\`.\${${this.transpiler.className}}\`` : `'.' + ${this.transpiler.className}`);
	else if(this.scope) this.addScope(JSON.stringify('.' + this.scope));
};

SSBMode.prototype.find = function(){
	return this.parser.find(['$', '<', 'v', 'c', 'l', 'i', 'e', 'f', '{', '}', ';'], false, false);
};

SSBMode.prototype.lastValue = function(callback, parser){
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
	// create filtered array and add observables to mode's dependencies
	var filtered = this.current.filter(part => {
		if(part.text) {
			return part.value.length;
		} else {
			this.observables.push(...part.value.observables);
			this.maybeObservables.push(...part.value.maybeObservables);
			return true;
		}
	});
	if(!filtered.length) {
		filtered.push({text: true, value: ""});
	}
	if(this.es6) {
		callback("`" + filtered.map(part => part.text ? part.value.replace(/(`|\$|\\)/gm, "\\$1") : `\${${parser ? parser(part.value.source) : part.value.source}}`).join("") + "`");
	} else {
		if(!filtered[0].text) {
			filtered.unshift({text: true, value: ""});
		}
		callback(filtered.map(part => part.text ? stringify(part.value) : (parser ? parser(part.value.source) : `(${part.value.source})`)).join(" + "));
	}
	if(end) this.add(end);
	this.current = [];
};

SSBMode.prototype.parseImpl = function(pre, match, handle, eof){
	switch(match) {
		case '<':
			if(!/\s/.test(this.parser.peek())) {
				TextExprMode.prototype.parseImpl.call(this, pre, match, handle, eof);
				break;
			}
		case '{':
			this.lastValue(value => this.addScope(value));
			this.statements.push({
				selector: true,
				observables: [],
				maybeObservables: [],
				end: "",
				parts: [{}],
				single: match == '<'
			});
			this.inExpr = false;
			break;
		case ';':
			var scope = this.scopes[this.scopes.length - 1];
			var filtered = this.current.filter(c => !c.text || c.value.trim().length);
			if(filtered.length == 1 && !filtered[0].text && Polyfill.startsWith.call(filtered[0].value.source, "...")) {
				this.add(`${scope}.spread(${filtered[0].value.source.substr(3)});`);
				var curr;
				while((curr = this.current.pop()).text) this.add(curr.value);
				this.current = [];
			} else {
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
							this.lastValue(value => this.add(`${scope}.value(${value}`));
							this.add(",");
							this.current = value;
							this.lastValue(value => this.add(value + ");"), value => SSBMode.reparseExpr(value, transpiler));
							break;
						}
					}
				}
				if(!value) {
					this.lastValue(value => this.add(`${scope}.stat(${value});`));
				}
			}
			var statement = this.statements[this.statements.length - 1];
			if(statement && statement.single) {
				// inlined with @, close statement
				this.onStatementEnd(this.statements.pop());
			}
			this.inExpr = false;
			break;
		default:
			TextExprMode.prototype.parseImpl.call(this, pre, match, handle, eof);
	}
};

SSBMode.prototype.parse = function(handle, eof){
	if(!this.inExpr) {
		this.add(this.parser.skip());
		this.inExpr = true;
	}
	LogicMode.prototype.parse.call(this, handle, eof);
};

SSBMode.prototype.onStatementStart = function(statement){
	this.inExpr = false;
};

SSBMode.prototype.onStatementEnd = function(statement){
	if(statement.selector) {
		this.removeScope();
		statement.endRef.value = ""; // remove closing brace
	} else {
		this.observables.push(...statement.observables);
		this.maybeObservables.push(...statement.maybeObservables);
	}
	this.inExpr = false;
};

SSBMode.prototype.addFinalCurrent = function(){
	// add remaining spaces at end
	while(this.current.length) {
		this.add(this.current.shift().value);
	}
};

SSBMode.prototype.end = function(){
	// replace unneeded closing braces and add statement.end needed for foreach
	this.popped.forEach(popped => {
		if(popped.selector) {
			this.source[popped.endIndex - 1] = "";
		} else if(popped.end.length) {
			this.source[popped.endIndex] = popped.end + this.source[popped.endIndex];
		}
	});
	// add return statement
	this.add(`return ${this.scopes[0]}.content}${this.es6 ? "" : ".bind(this)"}, [${uniq(this.observables).join(", ")}], [${this.maybeObservables.join(", ")}])`);
};

SSBMode.prototype.chainAfter = function(){
	if(this.scoped) return [this.transpiler.feature("scope")];
};

SSBMode.reparseExprImpl = function(expr, info, transpiler){
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
			if(!SSBMode.reparseExprImpl(parser.skipEnclosedContent().slice(1, -1), info, transpiler)) return false;
			info.computed += ')';
		} else {
			var v = parser.readSingleExpression(true);
			if(/^[a-zA-Z_$]/.exec(v)) {
				// it's a variable
				info.is = true;
				info.computed += `${transpiler.unit}(${v})`;
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

SSBMode.reparseExpr = function(expr, transpiler){
	var info = {
		runtime: transpiler.runtime,
		computed: `${transpiler.feature("cu")}(${transpiler.options.es6 ? `${transpiler.unit} =>` : `function(${transpiler.unit}){return`} `,
		is: false,
		op: 0
	};
	return SSBMode.reparseExprImpl(expr, info, transpiler) && info.is && info.op && `${info.computed}${transpiler.options.es6 ? "" : "}.bind(this)"})` || (transpiler.options.es6 ? expr : `(${expr})`);
};

/**
 * @class
 * @since 0.124.0
 */
function HTMLCommentMode(transpiler, parser, source, attributes) {
	TextExprMode.call(this, transpiler, parser, source, attributes);
	this.values = [];
}

HTMLCommentMode.getOptions = function(){
	return {comments: false, strings: false, children: false};
};

HTMLCommentMode.prototype = Object.create(TextExprMode.prototype);

HTMLCommentMode.prototype.add = function(text){
	if(text.length) this.values.push(stringify(text));
};

HTMLCommentMode.prototype.addText = function(expr){
	this.values.push(expr);
};

HTMLCommentMode.prototype.parse = function(handle, eof){
	var result = this.parser.find(['$'], false, true);
	this.pushText(result.pre);
	this.parseImpl(result.pre, result.match, handle, eof);
};

// register default modes

defineMode(["code", "javascript", "js"], SourceCodeMode, true);
defineMode(["html"], HTMLMode);
defineMode(["script"], ScriptMode);
defineMode(["css"], CSSMode);
defineMode(["ssb", "style"], SSBMode);
defineMode(["__comment"], HTMLCommentMode); // anonymous define

// register auto modes after default modes to give less precedence to `matchesTag`

defineMode(["auto-code"], AutoSourceCodeMode);
defineMode(["auto-html"], AutoHTMLMode);

module.exports = { modeRegistry, modeNames, defaultMode, startMode };
