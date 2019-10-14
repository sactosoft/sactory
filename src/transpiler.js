const { hash, now, optimize } = require("./transpiler/util");

const Parser = require("./parser");
const Result = require("./result");
const { getModeByName, getModeByTagName, startMode } = require("./mode/registry");

function getAttributeType(symbol) {
	switch(symbol) {
		case "": return Result.ATTRIBUTE_NONE;
		case "@": return Result.ATTRIBUTE_PROPERTY;
		case "&": return Result.ATTRIBUTE_STYLE;
		case "+": return Result.ATTRIBUTE_EVENT;
		case "$": return Result.ATTRIBUTE_WIDGET;
		case "~": return Result.ATTRIBUTE_UPDATE_WIDGET;
		case "*": return Result.ATTRIBUTE_BIND;
		case ":": return Result.ATTRIBUTE_DIRECTIVE;
	}
}

const defaultOptions = {
	mode: "auto-code:logic",
	modes: true,
	observables: {
		supported: true,
		peek: true,
		maybe: true,
		computed: true,
		functionAttributes: ["async"]
	},
	tags: {
		computed: true,
		capitalIsWidget: false,
		types: {
			directive: true,
			argumented: false,
			children: false,
			slot: false,
			special: true
		}
	},
	attributes: {
		computed: true,
		interpolated: true,
		spread: true,
		types: {
			directive: false,
			prop: false,
			style: false,
			event: false,
			widget: false,
			updateWidget: false,
			bind: false
		}
	},
	interpolation: {
		text: true,
		html: true,
		value: true,
		string: true,
		custom1: false,
		custom2: false,
		custom3: false
	},
	logic: {
		variables: ["var", "let", "const"],
		statements: [
			[["if", 1], ["else if", 1, 1], ["else", 0]],
			[["for", 1]],
			[["while", 1]],
			//[["await", 1], ["then", 1, 1], ["catch", 1, 1]],
			//[["await then", 1], ["catch", 1, 1]]
		],
		foreach: {
			array: true,
			object: true,
			range: true
		}
	}
};

class Transpiler {

	constructor(options = {}) {
		this.options = Object.assign({}, defaultOptions, options);
		//TODO better merge
		// separate mode and mode attributes
		this.options.modeAttributes = {};
		const column = this.options.mode.indexOf(":");
		if(column != -1) {
			const attrs = this.options.mode.substr(column + 1).split(":");
			this.options.mode = this.options.mode.substring(0, column);
			attrs.forEach(attr => {
				if(attr.charAt(0) == "!") {
					this.options.modeAttributes[attr.substr(1)] = false;
				} else {
					this.options.modeAttributes[attr] = true;
				}
			});
		}
		//TODO create common regular expressions used by the parser
	}

	/**
	 * @since 0.150.0
	 */
	newParser() {
		return new Parser();
	}

	/**
	 * @since 0.49.0
	 */
	nextId() {
		return this.count++;
	}

	/**
	 * @since 0.62.0
	 */
	warn(message, position) {
		if(!position) position = this.parser.position;
		this.warnings.push({message, position});
	}

	/**
	 * @since 0.16.0
	 */
	startMode(id, attributes) {
		const mode = startMode(id, this, this.parser, this.result, attributes,
			this.currentMode && this.currentMode.parser);
		this.currentMode = {
			name: mode.name,
			parser: mode,
			options: mode.options
		};
		this.modes.push(this.currentMode);
		return mode;
	}

	/**
	 * @since 0.16.0
	 */
	endMode() {
		const ret = this.modes.pop().parser;
		ret.end();
		this.currentMode = this.modes[this.modes.length - 1];
		if(this.currentMode) {
			Object.assign(this.parser.options, this.currentMode.options);
		}
		return ret;
	}

	/**
	 * @since 0.124.0
	 */
	parseImpl(modeId, input, parentParser, trackable) {
		const parser = new Parser(input, (parentParser || this.parser).position);
		parser.parseTemplateLiteral = expr => {
			const parsed = this.parseCode(expr, parser, trackable);
			mode.observables |= parsed.observables;
			return parsed.source;
		};
		const result = new Result();
		const mode = startMode(modeId, this, parser, result, {inAttr: true});
		mode.trackable = trackable;
		mode.start();
		while(parser.index < input.length) {
			mode.parse(() => source.addSource("<"), () => {});
		}
		mode.end();
		return {mode, result};
	}

	/**
	 * @since 0.42.0
	 */
	parseCode(input, parentParser, trackable) {
		let {mode: {observables}, result} = this.parseImpl(0, input, parentParser, trackable);
		return result.data;
	}

	/**
	 * @since 0.124.0
	 */
	parseText(input, parentParser) {
		return this.parseImpl(getModeByName("_comment"), input, parentParser).mode.values.join(" + ");
	}

	/**
	 * @since 0.51.0
	 */
	parseTemplateLiteral(expr, parser, trackable) {
		return this.parseCode(expr, parser, trackable).source;
	}

	/**
	 * Sets the parser's template literal parser to @{link parseTemplateLiteral}.
	 * @since 0.51.0
	 */
	updateTemplateLiteralParser() {
		this.parser.parseTemplateLiteral = this.parseTemplateLiteral.bind(this);
	}

	/**
	 * Closes a scope and optionally ends the current mode and restores the
	 * previous one.
	 * @since 0.29.0
	 */
	close(tagName, position) {
		if(tagName !== undefined) {
			// closing a tag, not called as EOF
			const closeInfo = this.tags.pop();
			if(closeInfo.tagName && closeInfo.tagName !== tagName) {
				this.parser.errorAt(position, `Tag \`${closeInfo.tagName}\` was not closed properly (used \`</${tagName}>\` instead of \`</${closeInfo.tagName}>\`).`);
			}
			if(closeInfo.mode) {
				this.endMode();
			}
			return closeInfo.resultRef;
		}
		if(this.closing.length) {
			this.source.push(this.closing.pop());
			this.addSemicolon();
		}
	}

	/**
	 * @since 0.29.0
	 */
	open() {
		if(this.parser.readIf("/")) {
			// closing a tag
			const position = this.parser.position;
			const { pre } = this.parser.find([">"], true, false); // skip until closed
			const start = this.close(pre, position);
			if(start) {
				// tag was not mode, add to result
				this.result.push(Result.TAG_CLOSE, position, {start});
			}
		} else if(this.parser.readIf("!")) {
			// some kind of comment
			const next = this.parser.input.substr(this.parser.index, 2);
			if(next === "--") {
				// xml comment
				this.parser.index += 2;
				this.result.push(Result.COMMENT_START, this.parser.position);
				this.parseText(this.parser.findSequence("-->", true).slice(0, -3)); //TODO
				this.result.push(Result.COMMENT_END);
				this.addSemicolon();
			} else if(next === "/*") {
				// code comment
				this.result.push(Result.SOURCE, this.parser.position, {value: this.parser.findSequence("*/>", true).slice(0, -1)});
			} else if(next === "//") {
				// inline code comment
				this.result.push(Result.SOURCE, this.parser.position, {value: this.parser.findSequence("\n", false)});
			} else {
				this.parser.error("Expected a comment after `<!`.");
			}
		} else if(this.currentMode.options.children === false && this.parser.peek() !== ":") {
			this.parser.error(`Mode \`${this.currentMode.name}\` cannot have children.`);
		} else {

			const position = this.parser.position;

			let sposition, skipped = "";
			const skip = () => {
				sposition = this.parser.position;
				return skipped = this.parser.skipImpl({comments: true});
			};

			// options
			let type = Result.TAG;
			let tagName;
			const tag = {
				optional: !!this.parser.readIf("?"),
				computed: false,
				inline: false,
				level: this.tags.length
			};

			let attributes = [];
			let newMode = -1;

			this.updateTemplateLiteralParser();
			if(this.options.tags.computed && (tagName = this.parser.readComputedExpr())) {
				// [tagName]
				tag.tagName = this.parseCode(tagName);
				tag.computed = true;
			} else {
				tagName = tag.tagName = this.parser.readTagName(true);
				if(this.options.tags.capitalIsWidget && tagName.charCodeAt(0) >= 65 && tagName.charCodeAt(0) <= 90 && tagName.indexOf("$") === -1) {
					tag.computed = true;
					tag.widgetName = tagName;
				}
			}

			// update tag types
			if(!tag.computed) {
				if(tagName.charAt(0) === ":") {
					if(tagName.charAt(1) === ":") {
						// mode declared with tag, search it and validate it
						const [ name, ...attrs ] = tagName.substr(2).split(":");
						const id = getModeByName(name);
						if(id === -1) {
							this.parser.errorAt(position, `Unknown mode "${name}".`);
						} else {
							// start mode and return early
							const obj = {};
							attrs.forEach(attr => {
								if(attr.charAt(0) === "!") {
									obj[attr.substr(1)] = false;
								} else {
									obj[attr] = true;
								}
							});
							const mode = this.startMode(id, obj);
							mode.parser.start();
							this.tags.push({
								tagName, position,
								mode: true
							});
							this.parser.last = undefined;
							return;
						}
					} else {
						type = Result.TAG_DIRECTIVE;
						tag.tagName = tagName.substr(1);
					}
				} else {
					if(tagName.charAt(0) == "@") {
						type = Result.TAG_SLOT;
						tag.tagName = tagName.substr(1);
					} else if(tagName.charAt(0) == "#") {
						type = Result.TAG_SPECIAL;
						tag.tagName = tagName.substr(1);
					}
					// search for an auto-opening mode
					newMode = getModeByTagName(tagName, this.currentMode.parser);
				}
			}

			// read argument(s)
			skip();
			if(this.options.tags.types.argumented && this.parser.peek() == "(") {
				arg = this.parser.skipEnclosedContent(true);
				skip();
			}

			// add to result
			this.result.push(type, position, tag);

			// read attributes
			let next = false;
			let count = 0;
			while(!this.parser.eof() && (next = this.parser.peek()) != ">" && next != "/") {
				if(!/[\n\t ]/.test(skipped)) {
					this.parser.errorAt(sposition, "Space is required between attribute names.");
				}
				this.updateTemplateLiteralParser();
				const position = this.parser.position;
				const attr = {
					count,
					optional: !!this.parser.readIf("?"),
					negated: !!this.parser.readIf("!"),
					subtype: getAttributeType(this.parser.readAttributePrefix() || ""),
					beforeName: skipped
				};
				if(this.isSpreadAttribute()) {
					//TODO assert not optional nor negated
					//TODO directives and binds cannot be spread
					this.result.push(Result.ATTRIBUTE_SPREAD, position, {
						count,
						subtype: attr.subtype,
						expr: this.parseCode(this.parser.readSingleExpression(false, true)),
						space: skipped
					});
					skip();
				} else {
					let type = Result.ATTRIBUTE_NONE;
					const content = this.parseAttributeName(false);
					if(this.parser.readIf("{")) {
						//TODO directives and binds cannot be interpolated
						// interpolated
						attr.before = content;
						attr.inner = [];
						do {
							let curr, before = skip();
							if(this.isSpreadAttribute()) {
								attr.inner.push(curr = {
									spread: true,
									expr: this.parser.readSingleExpression(false, true)
								});
							} else {
								curr = this.parseAttributeName(true);
								this.compileAttributeParts(curr);
								attr.inner.push(curr);
							}
							curr.beforeValue = before;
							curr.afterValue = skip();
						} while((next = this.parser.read()) === ",");
						if(next != "}") {
							this.parser.error("Expected `}` after interpolated attributes list.");
						}
						attr.after = this.parseAttributeName(false);
						this.compileAttributeParts(attr.before);
						this.compileAttributeParts(attr.after);
					} else if(content.parts.length === 0 && attr.type !== "$") {
						this.parser.error("Cannot find a valid attribute name.");
					} else {
						Object.assign(attr, content);
					}

					// read value
					skip();
					if(this.parser.readIf("=")) {
						attr.afterName = skipped;
						attr.beforeValue = skip();
						this.parser.parseTemplateLiteral = null;
						const value = this.parser.readAttributeValue();
						if(value.startsWith("{{")) {
							attr.isFunction = true;
							attr.value = this.parseCode(value.slice(1, -1), undefined, false);
						} else {
							/*const optimized = optimize(value);
							if(optimized) {
								attr.value = optimized;
							} else {
								attr.value = this.parseCode(value, undefined, true);
							}*/
							attr.value = this.parseCode(value, undefined, true);
						}
						skip();
					}
					if(attr.inner) {
						if(!Object.prototype.hasOwnProperty.call(attr, "value")) {
							attr.value = this.getDefaultAttributeValue(attr);
						}
						this.result.push(Result.ATTRIBUTE_INTERPOLATED, position, attr);
					} else {
						this.compileAttributeParts(attr);
						if(!Object.prototype.hasOwnProperty.call(attr, "value")) {
							attr.value = [{type: Result.SOURCE, value: this.getDefaultAttributeValue(attr)}];
						}
						this.result.push(Result.ATTRIBUTE, position, attr);
					}
				}
				next = false;
				count++;
			}

			// check end of tag declaration
			this.parser.index++;
			if(!next) {
				this.parser.errorAt(position, "Tag was not closed.");
			} else {
				// add end to result
				if(next === "/") {
					tag.inline = true;
					if(!this.parser.readIf(">")) {
						this.parser.error("Tag was not closed properly: expected `>` after `/`.");
					}
				} else {
					// add to the list of opened tags
					this.tags.push({
						tagName, position,
						mode: newMode !== -1,
						resultRef: tag
					});
					// start new mode if needed
					if(newMode !== -1) {
						//TODO parameters from directive attributes
						this.startMode(newMode, {}).start();
					}
				}
				this.result.push(Result.TAG_END, null, {start: tag, inline: tag.inline});
			}

		}
		this.parser.last = undefined;
	};

	/**
	 * @since 0.107.0
	 */
	isSpreadAttribute() {
		if(this.parser.input.substr(this.parser.index, 3) == "...") {
			this.parser.index += 3;
			return true;
		} else {
			return false;
		}
	}

	/**
	 * @since 0.60.0
	 */
	parseAttributeName(force) {
		var attr = {
			computed: false,
			parts: []
		};
		var required = force;
		// eslint-disable-next-line no-constant-condition
		while(true) {
			let ret = {};
			if(ret.name = this.parser.readComputedExpr()) {
				attr.computed = ret.computed = true;
				if(ret.name.charAt(0) == "[" && ret.name.charAt(ret.name.length - 1) == "]") {
					ret.name = ret.name.slice(1, -1);
					if(ret.name.charAt(0) == "[") {
						ret.name = `${this.runtime}.config.s${ret.name}`;
					} else {
						ret.name = `${this.runtime}.config.s["${ret.name}"]`;
					}
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
	}

	/**
	 * @since 0.127.0
	 */
	getDefaultAttributeValue({subtype, negated}) {
		switch(subtype) {
			case Result.ATTRIBUTE_NONE:
				return "\"\"";
			case Result.ATTRIBUTE_PROPERTY:
			case Result.ATTRIBUTE_WIDGET:
			case Result.ATTRIBUTE_UPDATE_WIDGET:
			case Result.ATTRIBUTE_DIRECTIVE:
				return !negated;
			case Result.ATTRIBUTE_EVENT:
				return false;
			case Result.ATTRIBUTE_STYLE:
				if(negated) return "!1";
		}
		this.parser.error("Value for attribute is required.");
	}

	/**
	 * @since 0.82.0
	 */
	compileAttributeParts(attr) {
		if(attr.computed) {
			var names = [];
			attr.parts.forEach(part => {
				if(part.computed) names.push(`(${part.name})`);
				else names.push(JSON.stringify(part.name));
			});
			attr.name = `${this.feature("attr")}(${names.join(", ")})`;
		} else {
			attr.name = attr.parts.map(part => part.name).join("");
		}
	}

	/**
	 * @since 0.84.0
	 */
	stringifyAttribute(attr) {
		return attr.computed ? attr.name : "\"" + attr.name + "\"";
	}

	/**
	 * @since 0.50.0
	 */
	transpile(input) {

		var start = now();
		
		this.parser = new Parser(input);
		this.result = new Result();

		this.count = hash((this.options.namespace || this.options.filename) + "") % 100000;

		this.warnings = [];
		
		this.tags = [];
		this.inherit = [];
		this.closing = [];
		this.modes = [];

		this.level = 0;
		
		//TODO check mode before starting
		this.startMode(getModeByName(this.options.mode), this.options.modeAttributes).start();
		
		const open = Transpiler.prototype.open.bind(this);
		const close = Transpiler.prototype.close.bind(this);

		while(!this.parser.eof()) {
			this.updateTemplateLiteralParser();
			this.currentMode.parser.parse(open, close);
		}

		// check whether all tags were closed properly
		if(this.tags.length) {
			const { tagName, position } = this.tags.pop();
			this.parser.errorAt(position, `Tag was never closed.`);
		}
		
		this.endMode();

		if(!this.options.silent) {
			this.warnings.forEach(({message, position}) => console.warn(`${this.options.filename}[${position.line + 1}:${position.column}]: ${message}`));
		}
		
		return this.result.data;
		
	}

}

module.exports = Transpiler;
	