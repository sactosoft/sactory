const Result = require("../result");
const { Mode } = require("./mode");

/**
 * @since 0.15.0
 */
class SourceCodeMode extends Mode {

	constructor(transpiler, parser, result, attributes) {
		super(transpiler, parser, result, attributes);
		this.breakpoints = ["<", "(", ")", "[", "]", "{", "}"];
		const o = transpiler.options.observables;
		if(o.supported) {
			this.breakpoints.push("*");
			if(o.peek) this.breakpoints.push("^");
			if(o.computed) this.breakpoints.push("&");
		}
		this.parentheses = [];
		this.brackets = [];
		this.braces = [];
	}

	static get name() {
		return "code";
	}

	static getOptions() {
		return {
			isDefault: true,
			code: true,
			comments: true,
			strings: true,
			regexp: true
		};
	}

	restoreIndex(char) {
		this.addSource(null, this.parser.last = char);
		this.parser.lastIndex = this.parser.index - 1;
	}

	handleParenthesis(match) {
		this.restoreIndex(match);
	}

	addObservableImpl(peek, expr = []) {
		const maybe = !!this.parser.readIf("?");
		const position = this.parser.position;
		const undot = () => {
			if(expr.length) {
				const tail = expr[expr.length - 1];
				if(tail.type === Result.SOURCE && /^\s*\.\s*$/.test(tail.value)) {
					expr.pop();
					return true;
				}
			}
		};
		if(!expr.length && this.parser.peek() == "(") {
			expr.push(...this.parseCode("skipEnclosedContent", false));
		} else if(this.parser.peek() == "[" && undot()) {
			expr.push(...this.parseCode("skipEnclosedContent"));
		} else {
			expr.push(...this.parseCode("readVarName", false, true));
		}
		this.result.push(Result.OBSERVABLE_VALUE, position, {peek, maybe, expr});
		this.parser.last = "]"; // see issue#57
		this.parser.lastIndex = this.parser.index - 1;
	}

	addObservable(peek) {
		if(this.parser.couldStartRegExp()) {
			this.addObservableImpl(peek);
			return true;
		} else if(this.parser.last == ".") {
			//TODO
			this.addObservableImpl(peek, this.lookBehind());
			return true;
		} else {
			return false;
		}
	}

	lookBehind() {
		const MATCH_DOT = /\s*\.\s*$/;
		const MATCH_S = /\s*$/;
		let tail = this.result.tail;
		let match;
		if(tail && tail.type === Result.SOURCE && (match = tail.value.match(MATCH_DOT))) {
			// the observable is chained
			let expr = [];
			let matchExpr;
			const parseAt0 = () => {
				tail = this.result.tail;
				if(tail) {
					if(tail.type === Result.SOURCE) {
						if(tail.value === "]") {
							const { id } = tail.start;
							let ref, i = this.result.data.length - 2;
							while(this.result.data[i].id !== id) {
								i--;
							}
							expr.unshift(...this.result.data.splice(i, this.result.data.length - i));
							parseAt0();
							matchExpr = MATCH_S;
						} else if(tail.value === ")") {
							//TODO
						} else {
							//TODO throw error? or handle variable
						}
					} else if(tail.type === Result.OBSERVABLE_VALUE) {
						expr.unshift(this.result.data.pop());
						tail = this.result.tail;
					} else {
						//TODO throw error?
					}
				}
			};
			do {
				matchExpr = MATCH_DOT;
				expr.unshift({type: Result.SOURCE, value: tail.value.substr(match.index)});
				if(match.index === 0) {
					// remove last array value from result
					this.result.data.pop();
					parseAt0();
				} else {
					tail.value = tail.value.substring(0, match.index);
					// only possibility is a variable name
					const vmatch = tail.value.match(/[a-zA-Z0-9_$]+$/);
					if(vmatch) {
						const value = tail.value.substr(vmatch.index);
						tail.value = tail.value.substring(0, vmatch.index);
						expr.unshift({type: Result.SOURCE, value});
					} else {
						//TODO throw error
					}
				}
			} while(tail && (match = tail.value.match(matchExpr)));
			return expr;
		} else {
			return [];
		}
	}

	parse(handle, eof) {
		const position = this.parser.position;
		const { pre, match } = this.parser.find(this.breakpoints, false, true);
		if(pre) {
			this.addSource(position, pre);
		}
		if(match == "<") {
			if(this.parser.couldStartRegExp() && this.parser.input.charAt(this.parser.index - 2) != "<") {
				handle();
			} else {
				// just a comparison or left shift
				this.addSource(null, "<");
				this.parser.last = "<";
				this.parser.lastIndex = this.parser.index;
			}
		} else if(match) {
			this.next(match);
		} else {
			eof();
		}
	}

	next(match) {
		switch(match) {
			case "(":
				this.parser.parentheses.push({
					lastIndex: this.parser.lastIndex,
					start: this.parser.index
				});
				this.handleParenthesis(match);
				break;
			case ")":
				var popped = this.parser.parentheses.pop();
				if(popped) popped.end = this.parser.index;
				this.parser.lastParenthesis = popped;
				this.handleParenthesis(match);
				break;
			case "[":
				this.brackets.push(this.addSource(this.parser.position, "["));
				break;
			case "]": {
				const start = this.brackets.pop();
				start.end = this.result.push(Result.SOURCE, this.parser.position, {value: "]", start});
				break;
			}
			case "{":
				var last = this.parser.last;
				this.restoreIndex("{");
				if(!this.attributes.inAttr && last == ")" && !this.parser.lastKeywordAtIn(this.parser.lastParenthesis.lastIndex, "if", "for", "while", "switch", "catch", "with")) {
					// new function declaration
					const lp = this.parser.lastParenthesis;
					//this.source.startFunction(this.parser.input.substring(lp.start, lp.end - 1));
				} else {
					// loop/conditional statement
					//this.source.startScope();
				}
				break;
			case "}":
				this.restoreIndex("}");
				//this.source.endScope();
				break;
			case "$": {
				if(this.parser.readIf("$")) {
					let input = this.parser.input.substr(this.parser.index);
					if(Polyfill.startsWith.call(input, "context")) {
						this.parser.index += 7;
						this.source.addContext();
						this.parser.last = "t";
						return;
					}
					const functions = ["on", "subscribe", "depend", "rollback", "bind", "unbind", "bindInput"];
					for(let i in functions) {
						let fname = functions[i];
						if(Polyfill.startsWith.call(input, fname + "(")) {
							this.parser.index += fname.length + 1;
							this.source.addSource(`$$${fname}(`);
							this.source.addContext();
							this.source.addSource(", ");
							this.parser.last = ",";
							return;
						}
					}
					this.restoreIndex("$");
				}
				this.restoreIndex("$");
				break;
			}
			case "&": {
				if(this.parser.couldStartRegExp() || this.parser.lastKeywordIn(...this.transpiler.options.observables.functionAttributes)) {
					const space = this.parser.skipImpl({comments: true});
					let computed = true;
					let source = "";
					let index;
					const previous = () => {
						const length = tail.value.length;
						var beforeSpace = index;
						while(index < length && /\s/.test(tail.value.charAt(length - index - 1))) {
							index++;
						}
						var prevStart = index;
						while(index < length && /[a-zA-Z0-9_$]/.test(tail.value.charAt(length - index - 1))) {
							index++;
						}
						if(prevStart == index) {
							index = beforeSpace;
							return false;
						} else {
							return tail.value.substr(tail.value.length - index, index - prevStart);
						}
					};
					this.parser.parseTemplateLiteral = null;
					if(this.parser.readIf(")")) {
						// wrapped in parentheses
						this.add(space);
						let popped = this.parser.parentheses.pop();
						if(popped) popped.end = this.parser.index;
						this.parser.lastParenthesis = popped;
						this.handleParenthesis(")");
						if(popped) {
							// parentheses do match
							let start = popped.start;
							this.add(this.parser.skipImpl({comments: true}));
							if(this.parser.readIf("=")) {
								// arrow function, start is before the open parenthesis
								this.parser.expect(">");
								this.add("=>");
								index = this.parser.index - start;
							} else if(this.parser.peek() == "{") {
								// a function
								if(this.parser.lastKeywordAt(popped.lastIndex, "function")) {
									index = this.parser.index - popped.lastIndex + 6;
								} else {
									index = this.parser.index - popped.lastIndex - 2;
									previous(); // function name
									previous(); // `function` keyword
								}
							} else {
								// not a computed observable, just an observable with no value
								let index = tail.value.length - (this.parser.index - this.parser.lastParenthesis.end) - 1;
								tail.value = `${tail.value.substring(0, index)}${this.transpiler.feature("cofv")}(${this.source.getContext()})${tail.value.substr(index)}`;
								coff = false;
							}
						}
					} else if(this.parser.peek() == "=") {
						// from arrow function not wrapped
						index = space.length + 2;
						this.parser.read(); // =
						this.parser.expect(">");
						source = `()${space}=>`;
					} else {
						// from variable
						const expr = this.transpiler.parseCode(this.parser.readSingleExpression(true));
						//TODO add space
						this.result.push(Result.OBSERVABLE, null, {expr});
						computed = false;
					}
					if(computed) {
						let beforeIndex = index;
						let afterIndex = index;
						let mod, mods = {};
						/*while(mod = previous()) {
							if(["async", "defer"].indexOf(mod) != -1) {
								mods[mod] = true;
								beforeIndex = index;
							} else {
								break;
							}
						}*/
						// add expression
						const position = this.parser.position;
						const expr = this.transpiler.parseCode(source + this.parser.readExpression(), null, true);
						this.result.push(Result.COMPUTED_OBSERVABLE, position, {expr});
					}
					this.transpiler.updateTemplateLiteralParser();
					this.parser.last = "]"; // see issue#57
					this.parser.lastIndex = this.parser.index - 1;
				} else {
					// bitwise or boolean comparator
					this.restoreIndex("&");
					if(this.parser.readIf("&")) this.restoreIndex("&"); // skip to avoid treating it as possible `and`
				}
				break;
			}
			case "*":
				if(!this.addObservable(false)) {
					// just a multiplication or exponentiation
					this.restoreIndex("*");
					if(this.parser.readIf("*")) {
						// exponentiation, skip to avoid trying to treat it as observable
						this.restoreIndex("*");
					}
				}
				break;
			case "^":
				if(!this.addObservable(true)) {
					// xor operator
					this.restoreIndex("^");
				}
				break;
		}
	}

}

/**
 * @since 0.108.0
 */
class AutoSourceCodeMode extends SourceCodeMode {

	constructor(transpiler, parser, result, attributes) {
		super(transpiler, parser, result, attributes);
	}

	static get name() {
		return "auto-code";
	}

	static getOptions() {
		return SourceCodeMode.getOptions();
	}

}

module.exports = { SourceCodeMode, AutoSourceCodeMode };
