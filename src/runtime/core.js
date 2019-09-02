var Polyfill = require("../polyfill");
var Const = require("../const");
var { hyphenate } = require("../util");

var SactoryAnimation = require("./animation");
var SactoryBind = require("./bind");
var SactoryConfig = require("./config");
var SactoryConst = require("./const");
var SactoryMisc = require("./misc");
var SactoryObservable = require("./observable");

var counter = require("./counter");

// global variable for hidden elements. A single class is used
// in the whole web page to hide elements.
var hidden;

/**
 * @class
 */
function Sactory(element) {
	this.element = element;
	this.hasComplexStyle = false;
	this.styles = [];
	this.events = {};
}

Sactory.prototype.widgets = {};

Sactory.prototype.widget = null;

/**
 * @since 0.42.0
 */
Sactory.prototype.subscribe = function(bind, subscription){
	if(bind) bind.subscriptions.push(subscription);
};

/**
 * @since 0.129.0
 */
Sactory.prototype.observeImpl = function(bind, observable, fun, type){
	var ret = observable.subscribe(fun, type);
	this.subscribe(bind, ret);
	fun(observable.value);
	return ret;
};

/**
 * @since 0.129.0
 */
Sactory.prototype.observe = function(bind, bo, fun){
	return this.observeImpl(bind, bo.use(bind), fun);
};
	
Sactory.prototype.attr = function(name, value, bind){
	if(SactoryMisc.isBuilderObservable(value)) {
		this.observe(bind, value, value => this.element.setAttribute(name, value));
	} else {
		this.element.setAttribute(name, value);
	}
};
	
Sactory.prototype.prop = function(name, value, bind, type){
	if(SactoryMisc.isBuilderObservable(value)) {
		this.observe(bind, value, value => this.element[name] = value, type);
	} else {
		this.element[name] = value;
	}
};

/**
 * @since 0.63.0
 */
Sactory.prototype.append = function(element, bind, anchor){
	if(anchor && anchor.parentNode === this.element) this.element.insertBefore(element, anchor);
	else this.element.appendChild(element);
	if(bind) bind.appendChild(element);
};

/**
 * @since 0.79.0
 */
Sactory.prototype.complexStyle = function(name, value, bind){
	if(this.element.style.length) {
		// transfer inline styles
		var values = Array.prototype.map.call(this.element.style, name => ({name, value: this.element.style[name]}));
		if(values.length) this.styleImpl(values, bind);
		// remove inline styles
		this.element.removeAttribute("style");
		// transfer inline styles that are observables
		this.styles.forEach(({name, value, subscription, bind}) => {
			subscription.dispose();
			this.styleImpl([{name, value}], bind);
		});
	}
	this.hasComplexStyle = true;
	var node = document.createElement("style");
	/* debug:
	node.setAttribute(":usage", "inline-pseudo-class");
	node.setAttribute(":for", this.runtimeId);
	*/
	var className = counter.nextPrefix();
	var wrap;
	var dot = name.indexOf('.');
	if(dot == -1) {
		wrap = value => `.${className}${name}{${value}}`;
	} else {
		var prop = hyphenate(name.substr(dot + 1));
		name = name.substring(0, dot);
		if(prop.charAt(0) == "!") {
			prop = prop.substr(1);
			wrap = value => `.${className}${name}{${prop}:${value} !important;}`;
		} else {
			wrap = value => `.${className}${name}{${prop}:${value};}`;
		}
	}
	if(SactoryMisc.isBuilderObservable(value)) {
		this.observe(bind, value, value => node.textContent = wrap(value));
	} else {
		node.textContent = wrap(value);
	}
	this.className(className);
	document.head.appendChild(node);
};

/**
 * @since 0.121.0
 */
Sactory.prototype.style = function(name, value, bind){
	if(this.hasComplexStyle) {
		if(value === false) {
			this.styleImpl([{name, value: "0"}, {name, value: "none"}], bind);
		} else {
			this.styleImpl([{name, value}], bind);
		}
	} else {
		var prop = name;
		var get = value => value;
		var update = value => this.element.style[prop] = get(value);
		if(name.charAt(0) == "!") {
			prop = name.substr(1);
			get = value => `${value} !important`;
		}
		if(SactoryMisc.isBuilderObservable(value)) {
			var subscription = this.observe(bind, value, update);
			this.styles.push({name, value, subscription, bind});
		} else if(value === false) {
			update("0");
			update("none");
		} else {
			update(value);
		}
	}
};

/**
 * @since 0.121.0
 */
Sactory.prototype.styleImpl = function(values){
	// hyphenate and convert to string
	values.forEach(a => {
		var name = hyphenate(a.name);
		if(name.charAt(0) == "!") {
			name = name.substr(1);
			a.toString = () => `${name}:${a.value} !important;`;
		} else {
			a.toString = () => `${name}:${a.value};`;
		}
	});
	var node = document.createElement("style");
	/* debug:
	node.setAttribute(":usage", "inline-styles");
	node.setAttribute(":for", this.runtimeId);
	*/
	var className = counter.nextPrefix();
	var update = () => node.textContent = `.${className}{${values.join("")}}`;
	values.forEach(({value, bind}) => {
		if(SactoryMisc.isBuilderObservable(value)) {
			value = value.use(bind);
			this.subscribe(bind, value.subscribe(update));
		}
	});
	update();
	this.className(className);
	document.head.appendChild(node);
};
	
Sactory.prototype.text = function(value, bind, anchor){
	var textNode;
	if(SactoryMisc.isBuilderObservable(value)) {
		textNode = document.createTextNode("");
		this.observe(bind, value, value => {
			textNode.textContent = value + "";
			textNode.observed = true;
		});
	} else {
		textNode = document.createTextNode(value);
	}
	if(anchor && anchor.parentNode === this.element) this.element.insertBefore(textNode, anchor);
	else this.element.appendChild(textNode);
	if(bind) bind.appendChild(textNode);
};

/**
 * @since 0.63.0
 */
Sactory.prototype.html = function(value, bind, anchor){
	var children, container = document.createElement("div");
	var parse = (value, anchor) => {
		container.innerHTML = value;
		children = Array.prototype.slice.call(container.childNodes, 0);
		children.forEach(child => this.append(child, bind, anchor));
	};
	if(SactoryMisc.isBuilderObservable(value)) {
		value = value.use(bind);
		// create an anchor to maintain the right order
		var innerAnchor = SactoryBind.anchor({element: this.element, bind, anchor});
		this.subscribe(bind, value.subscribe(value => {
			// removing children from bind context should not be necessary,
			// as they can't have any sactory-created context
			children.forEach(child => this.element.removeChild(child));
			parse(value, innerAnchor);
		}));
		parse(value.value, innerAnchor);
	} else {
		parse(value, anchor);
	}
};

/**
 * @since 0.100.0
 */
Sactory.prototype.className = function(className, bind){
	if(SactoryMisc.isBuilderObservable(className)) {
		var value = className.value;
		this.subscribe(bind, className.subscribe(newValue => {
			this.removeClassName(value);
			this.addClassName(value = newValue);
		}));
		this.addClassName(value);
		if(bind) {
			bind.addRollback(() => this.removeClassName(value));
		}
	} else {
		this.addClassName(className);
		if(bind) {
			bind.addRollback(() => this.removeClassName(className));
		}
	}
};

/**
 * @since 0.100.0
 */
Sactory.prototype.classNameIf = function(className, condition, bind){
	if(SactoryMisc.isBuilderObservable(condition)) {
		condition = condition.use(bind);
		this.subscribe(bind, condition.subscribe(newValue => {
			if(newValue) {
				// add class
				this.addClassName(className);
			} else {
				// remove class name
				this.removeClassName(className);
			}
		}));
		if(condition.value) this.addClassName(className);
		if(bind) {
			bind.addRollback(() => condition.value && this.removeClassName(className));
		}
	} else if(condition) {
		this.addClassName(className);
		if(bind) {
			bind.addRollback(() => this.removeClassName(className));
		}
	}
};

/**
 * @since 0.22.0
 */
Sactory.prototype.event = function(name, value, bind){
	var split = name.split(':');
	if(name.args) split = split.map(a => a.toValue());
	var event = split.shift();
	var listener = value || function(){};
	var options = {};
	split.reverse().forEach(mod => {
		var prev = listener;
		if(typeof mod == "function") {
			listener = function(event){
				if(mod.call(this, event)) prev.apply(this, arguments);
			};
		} else {
			switch(mod) {
				case "this":
					console.warn(`Event modifier ":this" does no longer work. Either bind the function yourself or use an arrow function to maintain the right scope.`);
					break;
				case "noargs":
					listener = function(){
						return prev.call(this);
					};
					break;
				case "prevent":
					listener = function(event){
						event.preventDefault();
						return prev.apply(this, arguments);
					};
					break;
				case "stop":
					listener = function(event){
						event.stopPropagation();
						return prev.apply(this, arguments);
					};
					break;
				case "once":
					options.once = true;
					break;
				case "passive":
					options.passive = true;
					break;
				case "capture":
					options.capture = true;
					break;
				case "bubble":
					options.capture = false;
					break;
				case "trusted":
					listener = function(event){
						if(event.isTrusted) return prev.apply(this, arguments);
					};
					break;
				case "!trusted":
					listener = function(event){
						if(!event.isTrusted) return prev.apply(this, arguments);
					};
					break;
				case "self":
					listener = function(event){
						if(event.target === this) return prev.apply(this, arguments);
					};
					break;
				case "!self":
					listener = function(event){
						if(event.target !== this) return prev.apply(this, arguments);
					};
					break;
				case "alt":
				case "ctrl":
				case "meta":
				case "shift":
					listener = function(event){
						if(event[mod + "Key"]) return prev.apply(this, arguments);
					};
					break;
				case "!alt":
				case "!ctrl":
				case "!meta":
				case "!shift":
					mod = mod.substr(1);
					listener = function(event){
						if(!event[mod + "Key"]) return prev.apply(this, arguments);
					};
					break;
				default:
					var positive = mod.charAt(0) != '!';
					if(!positive) mod = mod.substr(1);
					var dot = mod.split('.');
					switch(dot[0]) {
						case "key":
							var keys = dot.slice(1).map(function(a){
								var ret = a.toLowerCase();
								if(Object.prototype.hasOwnProperty.call(SactoryConfig.config.event.aliases, ret)) ret = SactoryConfig.config.event.aliases[ret];
								var separated = ret.split('-');
								if(separated.length == 2) {
									var range;
									if(separated[0].length == 1 && separated[1].length == 1) {
										range = [separated[0].toUpperCase().charCodeAt(0), separated[1].toUpperCase().charCodeAt(0)];
									} else if(separated[0].charAt(0) == 'f' && separated[1].charAt(0) == 'f') {
										range = [111 + parseInt(separated[0].substr(1)), 111 + parseInt(separated[1].substr(1))];
									}
									if(range) {
										return function(event){
											var code = event.keyCode || event.which;
											return code >= range[0] && code <= range[1];
										}
									}
								}
								if(ret != '-') ret = ret.replace(/-/g, "");
								return function(event){
									return event.key.toLowerCase() == ret;
								};
							});
							if(positive) {
								listener = function(event){
									for(var i in keys) {
										if(keys[i](event)) return prev.apply(this, arguments);
									}
								};
							} else {
								listener = function(event){
									for(var i in keys) {
										if(keys[i](event)) return;
									}
									return prev.apply(this, arguments);
								};
							}
							break;
						case "code":
							var keys = dot.slice(1).map(a => a.toLowerCase().replace(/-/g, ""));
							if(positive) {
								listener = function(event){
									if(keys.indexOf(event.code.toLowerCase()) != -1) return prev.apply(this, arguments);
								};
							} else {
								listener = function(event){
									if(keys.indexOf(event.code.toLowerCase()) == -1) return prev.apply(this, arguments);
								};
							}
							break;
						case "keyCode":
						case "key-code":
							var keys = dot.slice(1).map(a => parseInt(a));
							if(positive) {
								listener = function(event){
									if(keys.indexOf(event.keyCode || event.which) != -1) return prev.apply(this, arguments);
								};
							} else {
								listener = function(event){
									if(keys.indexOf(event.keyCode || event.which) == -1) return prev.apply(this, arguments);
								};
							}
							break;
						case "button":
							var buttons = dot.slice(1).map(function(a){
								switch(a) {
									case "main":
									case "left":
										return 0;
									case "auxiliary":
									case "wheel":
									case "middle":
										return 1;
									case "secondary":
									case "right":
										return 2;
									case "fourth":
									case "back":
										return 3;
									case "fifth":
									case "forward":
										return 4;
									default:
										return parseInt(a);
								}
							});
							if(positive) {
								listener = function(event){
									if(buttons.indexOf(event.button) != -1) return prev.apply(this, arguments);
								};
							} else {
								listener = function(event){
									if(buttons.indexOf(event.button) == -1) return prev.apply(this, arguments);
								};
							}
							break;
						case "location":
							var locations = dot.slice(1).map(function(a){
								switch(a) {
									case "standard": return 0;
									case "left": return 1;
									case "right": return 2;
									case "numpad": return 3;
									default: return parseInt(a);
								}
							});
							if(positive) {
								listener = function(event){
									if(locations.indexOf(event.location) != -1) return prev.apply(this, arguments);
								};
							} else {
								listener = function(event){
									if(locations.indexOf(event.location) == -1) return prev.apply(this, arguments);
								};
							}
							break;
						case "throttle":
							var delay = parseInt(dot[1]);
							if(delay >= 0) {
								var timeout = false;
								listener = function(event){
									if(!timeout) {
										prev.apply(this, arguments);
										timeout = true;
										timeout = setTimeout(() => timeout = false, delay);
									}
								};
							} else {
								throw new Error("Event delay must be higher or equals than 0.");
							}
							break;
						case "debounce":
							var delay = parseInt(dot[1]);
							if(delay >= 0) {
								var timeout;
								listener = function(event){
									if(timeout) clearTimeout(timeout);
									timeout = setTimeout(() => {
										timeout = 0;
										prev.apply(this, arguments);
									}, delay);
								};
							} else {
								throw new Error("Event delay must be higher or equals than 0.");
							}
							break;
						default:
							throw new Error("Unknown event modifier '" + mod + "'.");
					}
					break;
			}
		}
	});
	if(event == "documentappend") {
		// special event
		event = "append";
		var prev = listener;
		var element = this.element;
		listener = function(event){
			if(BuilderPolyfill.contains(element.ownerDocument, element)) {
				prev.call(element, event, element);
			} else {
				var parent = this.parentNode;
				while(parent.parentNode) parent = parent.parentNode;
				parent["~builder"].eventImpl("append", listener, options, bind);
			}
		};
	} else if(value) {
		var prev = listener;
		listener = function(event){
			prev.call(this, event, this);
		};
	}
	this.eventImpl(event, listener, options, bind);
};

/**
 * @since 0.91.0
 */
Sactory.prototype.eventImpl = function(event, listener, options, bind){
	this.events[event] = true;
	this.element.addEventListener(event, listener, options);
	if(bind) {
		bind.addRollback(() => this.element.removeEventListener(event, listener, options));
	}
};

if(SactoryConfig.config.ie) {
	var impl = Sactory.prototype.eventImpl;
	Sactory.prototype.eventImpl = function(event, listener, options, bind){
		if(options.once) {
			// polyfill
			var prev = listener;
			listener = function(){
				prev.apply(this, arguments);
				this.removeEventListener(event, listener, options.capture);
			};
		}
		impl.call(this, event, listener, options.capture, bind);
	};
}

/**
 * @since 0.62.0
 */
Sactory.prototype.addClassName = function(className){
	if(this.element.className.length && !Polyfill.endsWith.call(this.element.className, ' ')) className = ' ' + className;
	this.element.className += className;
};

/**
 * @since 0.62.0
 */
Sactory.prototype.removeClassName = function(className){
	var index = this.element.className.indexOf(className);
	if(index != -1) {
		this.element.className = (this.element.className.substring(0, index) + this.element.className.substr(index + className.length)).replace(/\s{2,}/, " ");
	}
};

/**
 * @since 0.69.0
 */
Sactory.prototype[Const.BUILDER_TYPE_NONE] = function({bind}, name, value){
	this.attr(name.toString(), value, bind);
};

/**
 * @since 0.63.0
 */
Sactory.prototype[Const.BUILDER_TYPE_PROP] = function({bind}, name, value){
	this.prop(name.toString(), value, bind);
};

/**
 * @since 0.121.0
 */
Sactory.prototype[Const.BUILDER_TYPE_STYLE] = function({bind}, name, value){
	name = name.toString();
	if(/[!a-z-]/.test(name.charAt(0))) {
		this.style(name, value, bind);
	} else {
		this.complexStyle(name, value, bind);
	}
};

/**
 * @since 0.96.0
 */
Sactory.prototype[Const.BUILDER_TYPE_CONCAT] = function({bind, anchor}, name, value){
	name = name.toString();
	switch(name) {
		case "text": return this.text(value, bind, anchor);
		case "html": return this.html(value, bind, anchor);
		case "class": return this.className(value, bind);
		default:
			if(Polyfill.startsWith.call(name, "class:")) {
				this.classNameIf(name.substr(6), value, bind);
			} else {
				throw new Error("Unknown concat attribute '" + name + "'.");
			}
	}
};

/**
 * @since 0.69.0
 */
Sactory.prototype[Const.BUILDER_TYPE_ON] = function({bind}, name, value){
	this.event(name, value, bind);
};

/**
 * @since 0.122.0
 */
Sactory.prototype.visibility = function({bind}, value, visible){
	if(!hidden) {
		hidden = counter.nextPrefix();
		var style = document.createElement("style");
		style.textContent = `.${hidden}{display:none !important;}`;
		/* debug:
		style.setAttribute(":usage", "visibility-toggle");
		*/
		document.head.appendChild(style);
	}
	var update = value => {
		if(!!value ^ visible) {
			this.addClass(hidden);
		} else {
			this.removeClass(hidden);
		}
	};
	if(SactoryMisc.isBuilderObservable(value)) {
		this.observe(bind, value, (newValue, oldValue) => update(newValue, oldValue));
	} else {
		update(value);
	}
};

/**
 * @since 0.46.0
 */
Sactory.prototype.form = function({bind}, info, value, update){
	var isObservable = SactoryObservable.isObservable(value);
	if(SactoryMisc.isBuilderObservable(value)) {
		isObservable = true;
		value = value.use(bind);
	}
	var events = info.split("::");
	var modifiers = events.shift();
	var updateType = SactoryConst.OUT_FORM_RANGE_START + Math.floor(Math.random() * SactoryConst.OUT_FORM_RANGE_LENGTH);
	var select = this.element.tagName.toUpperCase() == "SELECT";
	var get, set, converters = [];
	// calculate property name and default converter
	if(select) {
	 	if(this.element.multiple) {
			// select multiple, returns an array
			get = callback => callback(Array.prototype.map.call(BuilderPolyfill.selectedOptions(this.element), option => option.value));
			set = value => Array.prototype.forEach.call(this.element.options, option => option.selected = value.indexOf(option.value) != -1);
		} else {
			// normal select, just get and set the element's value
			get = callback => callback(this.element.value);
			set = value => this.element.value = value;
		}
	} else if(this.element.type == "checkbox") {
		// classic boolean binding using the element's `checked` property
		get = callback => callback(this.element.checked);
		set = value => this.element.checked = value;
	} else if(this.element.type == "radio") {
		// the event is called only when radio is selected
		get = callback => callback(this.element.value);
		set = value => this.element.checked = value == this.element.value;
		if(isObservable) {
			// make sure that the radio buttons that depend on the same observable have
			// the same name and are in the same radio group
			if(!this.element.name) {
				this.element.name = value._radioGroupName || (value._radioGroupName = counter.nextPrefix());
			}
		}
	} else {
		// normal input, values that are `null` and `undefined` are treated as empty strings
		get = callback => callback(this.element.value);
		set = value => this.element.value = value === null || value === undefined ? "" : value;
	}
	// subscribe if needed and/or update element's value
	if(isObservable) {
		this.observeImpl(bind, value, set, updateType);
	} else {
		set(value);
	}
	// calculate the default event type if none was specified
	if(!events.length) {
		if(select || this.element.type == "checkbox" || this.element.type == "radio") {
			events.push("change");
		} else {
			events.push("input");
		}
	}
	if(modifiers) {
		modifiers.split(":").forEach(mod => {
			if(mod.args) {
				mod = mod.toValue();
				if(typeof mod == "function") {
					converters.push(mod);
					return;
				}
			}
			converters.push(function(){
				switch(mod) {
					case "number":
					case "num":
					case "float":
						return function(){
							return +this;
						};
					case "int":
					case "integer":
						return function(){
							return Polyfill.trunc(+this);
						};
					case "str":
					case "string":
						return function(){
							return this + "";
						};
					case "date":
						switch(inputType) {
							case "date":
							case "month":
								return function(){
									var s = this.split('-');
									return new Date(s[0], s[1] - 1, s[2] || 1);
								};
							case "time":
								return function(){
									var s = this.split(':');
									var date = new Date();
									date.setHours(s[0]);
									date.setMinutes(s[1]);
									date.setSeconds(0);
									date.setMilliseconds(0);
									return date;
								};
							default:
								return function(){
									return new Date(this);
								};
						}
					case "comma":
						return function(){
							return this.replace(/,/g, '.');
						};
					case "trim":
						return String.prototype.trim;
					case "trim-left":
					case "trim-start":
						return Polyfill.trimStart;
					case "trim-right":
					case "trim-end":
						return Polyfill.trimEnd;
					case "lower":
					case "lowercase":
						return String.prototype.toLowerCase;
					case "upper":
					case "uppercase":
						return String.prototype.toUpperCase;
					case "capital":
					case "capitalize":
						return function(){
							return this.charAt(0).toUpperCase() + this.substr(1);
						};
					default:
						throw new Error("Unknown value modifier '" + mod + "'.");
				}
			}());
		});
	}
	if(isObservable) {
		if(value._dependencies) {
			// it's the child value of an observable, use the update
			// function to update the right value and also update the observable's
			// value to keep it in sync with the element's value
			converters.push(newValue => {
				value._value = value.wrapValue(newValue);
				update(newValue);
			});
		} else {
			// normal observable, call the observable's update with the correct update type
			converters.push(newValue => {
				value.update(newValue, updateType);
			});
		}
	} else {
		// not an observable, simply call the update function
		converters.push(update);
	}
	events.forEach(type => {
		this.event(type, () => {
			get(newValue => converters.forEach(converter => newValue = converter.call(newValue, newValue)));
		}, bind);
	});
};

// polyfill

if(Object.getOwnPropertyDescriptor(Element.prototype, "classList")) {

	Sactory.prototype.addClass = function(className){
		this.element.classList.add(className);
	};

	Sactory.prototype.removeClass = function(className){
		this.element.classList.remove(className);
	};

} else {

	Sactory.prototype.addClass= function(className){
		if(!this.element.className.split(' ').indexOf(className) != -1) {
			this.element.className = (this.element.className + ' ' + className).trim();
		}
	};

	Sactory.prototype.removeClass = function(className){
		this.element.className = this.element.className.split(' ').filter(function(a){
			return a != className;
		}).join(' ');
	};

}

if(typeof Event == "function") {

	Sactory.prototype.dispatchEvent = function(name, {bubbles, cancelable}){
		var event = new Event(name, {bubbles, cancelable});
		this.element.dispatchEvent(event);
		return event;
	};

} else {

	Sactory.prototype.dispatchEvent = function(name, {bubbles, cancelable}){
		var event = document.createEvent("Event");
		event.initEvent(name, bubbles, cancelable);
		this.element.dispatchEvent(event);
		return event;
	};

}

var BuilderPolyfill = {};

BuilderPolyfill.contains = function(owner, element){
	if(element.parentNode) {
		if(element.parentNode === owner) return true;
		else return BuilderPolyfill.contains(owner, element.parentNode);
	} else {
		return false;
	}
};

BuilderPolyfill.selectedOptions =
	typeof HTMLSelectElement == "function" && Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedOptions") ? 
	select => select.selectedOptions :
	select => Array.prototype.filter.call(select.options, option => option.selected);

module.exports = Sactory;
