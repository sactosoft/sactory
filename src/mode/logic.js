const { TextExprMode } = require("./textexpr");

/**
 * @since 0.53.0
 */
class LogicMode extends TextExprMode {

	constructor(transpiler, parser, result, attributes) {
		super(transpiler, parser, result, attributes);
		this.count = 0;
		this.statements = [];
		this.popped = [];
		this.logicMatches = this.matches.concat(["}", "\n"]);
		const add = symbol => {
			if(this.logicMatches.indexOf(symbol) === -1) {
				this.logicMatches.push(symbol);
			}
		};
		const o = transpiler.options.logic;
		o.variables.forEach(type => add(type.charAt(0)));
		o.statements.forEach(([[type]]) => add(type.charAt(0)));
		if(o.foreach.array || o.foreach.object || o.foreach.range) add("f");
	}

	getLineText() {
		const nl = this.current.lastIndexOf("\n");
		if(nl === -1) {
			return false;
		} else {
			return this.current.substr(nl);
		}
	}

	parseIf(expected, checkLine = true) {
		let line;
		if(
			// when the expected keyword is found
			this.parser.input.substr(this.parser.index, expected.length - 1) == expected.substr(1)
			// and when it is at the start of line
			&& (!checkLine || ((line = this.getLineText()) && !/\S/.test(line)))
			// and when it is an exact keyword
			&& !/[a-zA-Z0-9_$]/.test(this.parser.input.charAt(this.parser.index + expected.length - 1))
		) {
			return true;
		} else {
			if(line && line.slice(-1) == "\\") {
				// remove the backslash if there's one
				this.current = this.current.slice(0, -1);
				//TODO this may cause problems when checking for similar keywords?
			}
			return false;
		}
	}

	parseStatement(statement, trimmed, expected, condition, following) {
		const index = this.parser.index;
		this.parser.index += expected.length - 1;
		let part;
		const init = () => {
			this.addCurrent();
			this.addSource(null, trimmed);
			/*if(!statement.startRef) {
				statement.startRef = this.source.addIsolatedSource("");
			}*/
			statement.parts.push(part = {
				type: expected,
				following,
				observables: false,
				//declStart: this.source.addIsolatedSource("")
			});
		};
		if(condition === 1) {
			// with condition (e.g. `statement(condition)`)
			let skipped = this.parser.skipImpl({comments: true});
			if(this.parser.peek() !== "(") {
				// restore skipped code and fail to start the statement
				this.parser.index = index;
				this.pushText(trimmed);
				return false;
			}
			init();
			this.parser.parseTemplateLiteral = null;
			const reparse = (s, parser) => {
				const {source, observables} = this.transpiler.parseCode(s, parser, true);
				statement.observables |= observables;
				part.observables |= observables;
				return source;
			};
			const position = this.parser.position;
			const source = this.parser.skipEnclosedContent();
			if(expected == "foreach") {
				const parser = new Parser(source.slice(1, -1), position);
				Polyfill.assign(parser.options, {comments: true, strings: true, regexp: true});
				skipped += parser.skipImpl({comments: true});
				let expr, from, to;
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
					statement.unparsed = parser.readExpression();
					expr = reparse(statement.unparsed);
				}
				let rest = "";
				if(parser.input.substr(parser.index, 3) == "as ") {
					parser.index += 3;
					rest = parser.input.substr(parser.index);
				}
				if(expr) {
					let key, column = rest.indexOf(":");
					if(column == -1 || (key = rest.substring(0, column)).indexOf("{") != -1 || key.indexOf("[") != -1) {
						// divided in 4 parts so it can be modified later
						statement.ref.a = this.source.addIsolatedSource(this.transpiler.feature("forEachArray") + "(");
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
						rest = key + "," + rest.substr(column + 1);
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
				part.decl = this.source.addIsolatedSource(expected + skipped + reparse(source));
			}
		} else {
			// without condition
			init();
			part.decl = this.source.addIsolatedSource(expected);
		}
		this.source.addSource(this.parser.skipImpl({comments: true}));
		if(!(statement.inline = part.inline = !this.parser.readIf("{")) || !statement.inlineable) {
			this.source.addSource("{");
		}
		part.declEnd = this.source.addIsolatedSource("");
		this.statements.push(statement);
		this.onStatementStart(statement);
		return true;
	}

	parseLogic(expected, type, closing) {
		if(this.parseIf(expected)) {
			const trimmed = this.trimEnd();
			if(type === 2) {
				// variable
				this.addCurrent();
				const end = this.parser.find(closing || ["=", ";"], true, {comments: true});
				// add declaration (e.g. `var a =` or `var a;`)
				this.addSource(null, trimmed + expected.charAt(0) + end.pre + end.match);
				if(end.match == "=") {
					// add the value/body of the variable
					this.parser.parseTemplateLiteral = null;
					this.result.pushAll(this.transpiler.parseCode(this.parser.readExpression(), this.parser, true));
					if(this.parser.readIf(";")) this.addSource(null, ";");
				}
				return true;
			} else {
				return this.parseStatement({
					type: expected,
					observables: false,
					inlineable: true,
					end: "",
					parts: [],
					ref: {}
				}, trimmed, expected, type, closing);
			}
		} else {
			return false;
		}
	}

	find() {
		return this.parser.find(this.logicMatches, false, false);
	}

	parse(handle, eof) {
		const { pre, match } = this.find();
		if(pre.length) {
			this.pushText(pre);
		}
		if(!match || this.matches.indexOf(match) !== -1) {
			this.parseImpl(pre, match, handle, eof);
		} else if(match === "}") {
			if(pre.slice(-1) == "\\") {
				// remove backslash and replace it with closing brace
				this.current = this.current.slice(0, -1) + "}";
			} else if(this.statements.length) {
				this.closeStatement(false);
			} else {
				this.pushText("}");
			}
		} else if(match === "\n") {
			if(this.statements.length && this.statements[this.statements.length - 1].inline) {
				this.closeStatement(true);
			} else {
				this.pushText("\n");
			}
		} else {
			// check whether it could be a new statement
			//TODO check whether it is start of line before other checks
			const o = this.transpiler.options.logic;
			// check foreach
			if(match === "f" && (o.foreach.array || o.foreach.object || o.foreach.range)) {
				if(this.parseLogic("foreach", 1)) {
					return;
				}
			}
			// check variables
			for(let i=0; i<o.variables.length; i++) {
				if(this.parseLogic(o.variables[i], 2)) {
					return;
				}
			}
			// check statements
			for(let i=0; i<o.statements.length; i++) {
				const chain = o.statements[i];
				const [ type, args, repeated ] = chain[0];
				if(this.parseLogic(type, +args, chain.slice(1))) {
					return;
				}
			}
			// no match
			this.pushText(match);
		}
		/*
		switch(result.match) {
			case "c":
				if(!this.parseLogic("const", 0) && !this.parseLogic("case", 0, [":"])) this.pushText("c");
				break;
			case "l":
				if(!this.parseLogic("let", 0)) this.pushText("l");
				break;
			case "v":
				if(!this.parseLogic("var", 0)) this.pushText("v");
				break;
			case "b":
				if(!this.parseLogic("break", 0)) this.pushText("b");
				break;
			case "d":
				if(!this.parseLogic("default", 0, [":"])) this.pushText("d");
				break;
			case "i":
				if(!this.parseLogic("if", 1, [["else if", 1, true], ["else", 2, false]])) this.pushText("i");
				break;
			case "f":
				if(!this.parseLogic("foreach", 1) && !this.parseLogic("for", 1)) this.pushText("f");
				break;
			case "w":
				if(!this.parseLogic("while", 1)) this.pushText("w");
				break;
			case "s":
				if(!this.parseLogic("switch", 1)) this.pushText("s");
				break;
			case "}":
				if(result.pre.slice(-1) == "\\") {
					let curr = this.current[this.current.length - 1];
					curr.value = curr.value.slice(0, -1) + "}";
				} else if(this.statements.length) {
					this.closeStatement(false);
				} else {
					this.pushText("}");
				}
				break;
			case "\n":
				if(this.statements.length && this.statements[this.statements.length - 1].inline) {
					this.closeStatement(true);
				} else {
					this.pushText("\n");
				}
				break;
			default:
				this.parseImpl(result.pre, result.match, handle, eof);
		}*/
	}

	closeStatement(inline) {
		const statement = this.statements.pop();
		const part = statement.parts[statement.parts.length - 1];
		const trimmed = this.trimEnd();
		this.endChainable();
		this.source.addSource(trimmed);
		if(inline) {
			if(!statement.inlineable) {
				this.source.addSource("}");
			}
		}
		statement.endRef = part.close = this.source.addIsolatedSource((inline ? "" : "}") + statement.end);
		this.onStatementEnd(statement);
		if(inline) {
			this.pushText("\n");
		}
		if(part.following) {
			// try to start the next expression
			const trimmed = this.parser.skipImpl({comments: true});
			for(let i=0; i<part.following.length; i++) {
				let [expected, type, following] = part.following[i];
				if(following) following = part.following;
				if(this.parser.readIf(expected.charAt(0))) {
					if(this.parseIf(expected, false)) {
						if(this.parseStatement(statement, trimmed, expected, type, following)) {
							return;
						}
					} else {
						this.parser.index--;
					}
				}
			}
			this.pushText(trimmed);
		}
		this.popped.push(statement);
	}

	onStatementStart(/*statement*/) {}

	onStatementEnd(/*statement*/) {}

}

/**
 * @since 0.99.0
 */
class OptionalLogicMode extends LogicMode {

	constructor(transpiler, parser, result, attributes) {
		super(transpiler, parser, result, attributes);
		if(!attributes.logic) {
			this.parse = TextExprMode.prototype.parse.bind(this);
		}
	}

}

module.exports = { LogicMode, OptionalLogicMode };
