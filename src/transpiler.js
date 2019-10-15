const { ParserRegExp, Parser } = require("./parser");
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
			children: true,
			slot: false,
			special: true
		}
	},
	attributes: {
		computed: true,
		interpolated: true,
		spread: true,
		types: {
			directive: true,
			prop: true,
			style: true,
			event: true,
			widget: true,
			updateWidget: true,
			bind: true
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
		// init common regular expressions used by the parser
		this.regexp = new ParserRegExp(this.options);
	}

	/**
	 * @since 0.150.0
	 */
	newParser(input, position) {
		return new Parser(input, this.regexp, position);
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
	parseImpl(modeId, position, input) {
		const parser = this.newParser(input, position);
		parser.parseTemplateLiteral = expr => {
			const parsed = this.parseCode(parser.position, expr);
			mode.observables |= parsed.observables;
			return parsed.source;
		};
		const result = new Result();
		const mode = startMode(modeId, this, parser, result);
		mode.start();
		while(parser.index < input.length) {
			mode.parse(() => source.addSource("<"), () => {});
		}
		mode.end();
		return result.data;
	}

	/**
	 * @since 0.42.0
	 */
	parseCode(position, input) {
		return this.parseImpl(0, position, input);
	}

	/**
	 * @since 0.51.0
	 */
	parseTemplateLiteral(expr, parser, trackable) {
		return this.parseCode(parser, expr).source;
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
				const position = this.parser.position;
				const expr = this.parseImpl(getModeByName("_comment"), position, this.parser.findSequence("-->", true).slice(0, -3));
				this.result.push(Result.COMMENT, position, {expr});
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

			let attributes = new Result();
			let newMode = -1;

			this.updateTemplateLiteralParser();
			if(this.options.tags.computed && (tagName = this.parser.readComputedExpr())) {
				// [tagName]
				tag.tagName = this.parseCode(position, tagName);
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
					attributes.push(Result.ATTRIBUTE_SPREAD, position, {
						count,
						subtype: attr.subtype,
						expr: this.parseCode(this.parser.position, this.parser.readSingleExpression(false, true)),
						space: skipped
					});
					skip();
				} else {
					let type = Result.ATTRIBUTE_NONE;
					const content = this.parseAttributeName(false);
					if(this.parser.readIf("{")) {
						//TODO directives and binds cannot be interpolated
						// interpolated
						type = Result.ATTRIBUTE_INTERPOLATED;
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
								attr.inner.push(curr);
							}
							curr.beforeValue = before;
							curr.afterValue = skip();
						} while((next = this.parser.read()) === ",");
						if(next != "}") {
							this.parser.error("Expected `}` after interpolated attributes list.");
						}
						attr.after = this.parseAttributeName(false);
					} else if(!content.value) {
						this.parser.error("Cannot find a valid attribute name.");
					} else {
						attr.name = content;
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
							attr.value = this.parseCode(this.parser.position, value.slice(1, -1));
						} else {
							attr.value = this.parseCode(this.parser.position, value);
						}
						skip();
					}
					// add default value is needed
					if(!Object.prototype.hasOwnProperty.call(attr, "value")) {
						attr.value = [{type: Result.SOURCE, value: this.getDefaultAttributeValue(attr)}];
					}
					attributes.push(type, position, attr);
				}
				next = false;
				count++;
			}

			tag.attributes = attributes.data;

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
		let computed = false;
		let parts = [];
		let required = force;
		// eslint-disable-next-line no-constant-condition
		while(true) {
			let part = {};
			const position = this.parser.position;
			if(part.value = this.parser.readComputedExpr()) {
				computed = part.computed = true;
				if(part.value.charAt(0) == "[" && part.value.charAt(part.value.length - 1) == "]") {
					part.value = part.value.slice(1, -1);
					part.config = true;
					if(part.value.charAt(0) === "[" && part.value.slice(-1) === "]") {
						part.value = this.parseCode(position, part.value.slice(1, -1));
					} else {
						part.computed = false;
					}
				} else {
					part.value = this.parseCode(position, part.value);
				}
			} else if(!(part.value = this.parser.readAttributeName(required))) {
				break;
			}
			parts.push(part);
			required = false;
		}
		let ret = {computed};
		if(computed) {
			ret.value = parts.map(({computed = false, config = false, value}) => ({computed, config, value}));
		} else if(parts.length) {
			ret.value = parts[0].value;
		}
		return ret;
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
	 * @since 0.50.0
	 */
	transpile(filename, input) {

		if(arguments.length === 1) {
			input = filename;
			filename = "";
		}
		
		this.parser = this.newParser(input);
		this.result = new Result();

		this.warnings = [];
		
		this.tags = [];
		this.modes = [];
		
		//TODO check mode before starting
		this.startMode(getModeByName(this.options.mode), this.options.modeAttributes).start();
		
		const open = this.open.bind(this);
		const close = this.close.bind(this);

		while(!this.parser.eof()) {
			this.updateTemplateLiteralParser();
			this.currentMode.parser.parse(open, close);
		}

		// check whether all tags were closed properly
		if(this.tags.length) {
			const { tagName, position } = this.tags.pop();
			this.parser.errorAt(position, `Tag \`<${tagName}>\` was never closed.`);
		}
		
		this.endMode();

		if(!this.options.silent) {
			this.warnings.forEach(({message, position}) => console.warn(`${filename}[${position.line + 1}:${position.column}]: ${message}`));
		}
		
		return this.result.data;
		
	}

}

module.exports = Transpiler;
	