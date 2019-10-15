const Result = require("../result");
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
		const prev = statement.parts.length ? statement.parts[statement.parts.length - 1].ref : null;
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
			const reparse = (position, expr) => this.transpiler.parseCode(position, expr);
			const position = this.parser.position;
			const source = this.parser.skipEnclosedContent().slice(1, -1);
			if(expected == "foreach") {
				let type = "foreach-array";
				let data = {};
				const parser = this.transpiler.newParser(source, position);
				Object.assign(parser.options, {comments: true, strings: true, regexp: true});
				skipped += parser.skipImpl({comments: true});
				// `from` and `to` need to be reparsed searching for observables as `from` and `to`
				// are only keywords in this specific context
				const f = this.transpiler.options.logic.foreach;
				if(f.range && parser.input.substr(parser.index).startsWith("from ")) {
					type = "foreach-range";
					parser.index += 5;
					data.from = reparse(parser.position, parser.readExpression());
					parser.expectSequence("to ");
					data.to = reparse(parser.position, parser.readExpression());
				} else if(f.range && parser.input.substr(parser.index).startsWith("to ")) {
					type = "foreach-range";
					parser.index += 3;
					data.to = reparse(parser.position, parser.readExpression());
				} else {
					data.expr = reparse(parser.position, parser.readExpression());
				}
				if(parser.input.substr(parser.index, 3) == "as ") {
					parser.index += 3;
					const position = parser.position;
					const rest = parser.input.substr(parser.index);
					if(f.object && type !== "foreach-range") {
						const column = rest.indexOf(":");
						let key;
						if(column !== -1 && (key = rest.substring(0, column)).indexOf("{") === -1 && key.indexOf("[") === -1) {
							type = "foreach-object";
							data.key = reparse(position, key);
							data.as = reparse(position, rest.substr(column + 1)); //TODO increse position by key's position
						}
					}
					if(!data.as) {
						data.as = reparse(position, rest);
					}
				}
				part.ref = this.result.push(Result.STATEMENT_START, position, Object.assign({statement: type, prev}, data));
			} else {
				part.ref = this.result.push(Result.STATEMENT_START, position, {statement: expected, condition: reparse(position, skipped + source), prev});
			}
		} else {
			// without condition
			init();
			part.ref = this.result.push(Result.STATEMENT_START, this.parser.position, {statement: expected, prev});
		}
		if(prev) {
			prev.next = part.ref;
		}
		this.addSource(null, this.parser.skipImpl({comments: true}));
		statement.inline = part.inline = !this.parser.readIf("{");
		this.statements.push(statement);
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
					this.result.pushAll(this.transpiler.parseCode(this.parser.position, this.parser.readExpression()));
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
				const [ type, args ] = chain[0];
				if(this.parseLogic(type, +args, chain.slice(1))) {
					return;
				}
			}
			// no match
			this.pushText(match);
		}
	}

	closeStatement(inline) {
		const statement = this.statements.pop();
		const part = statement.parts[statement.parts.length - 1];
		const trimmed = this.trimEnd();
		this.addCurrent();
		this.addSource(null, trimmed);
		this.result.push(Result.STATEMENT_END, null, {start: part.ref});
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
