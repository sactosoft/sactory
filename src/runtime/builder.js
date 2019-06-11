var Polyfill = require("../polyfill");
var SactoryConfig = require("./config");
var SactoryObservable = require("./observable");
var SactoryBind = require("./bind");

// generate class name for hidden elements
var hidden = SactoryConfig.newPrefix();
var hiddenAdded = false;

/**
 * @class
 */
function Builder(element) {

	this.element = element;

	Object.defineProperty(this, "runtimeId", {
		configurable: true,
		get: function(){
			var id = Math.round(Math.random() * 100000);
			Object.defineProperty(this, "runtimeId", {
				get: function(){
					return id;
				}
			});
			return id;
		}
	});

}

Builder.TYPE_ATTR = 1;
Builder.TYPE_PROP = 2;
Builder.TYPE_ADD = 3;
Builder.TYPE_REMOVE = 4;
Builder.TYPE_WIDGET = 5;
Builder.TYPE_EXTEND_WIDGET = 6;

Builder.prototype.widgets = {};

/**
 * @since 0.42.0
 */
Builder.prototype.subscribe = function(bind, subscription){
	if(bind) bind.subscriptions.push(subscription);
};
	
Builder.prototype.attrImpl = function(name, value){
	if(value === null) {
		this.element.removeAttribute(name);
	} else {
		this.element.setAttribute(name, value);
	}
};
	
Builder.prototype.attr = function(name, value, bind){
	var attrImpl = this.attrImpl.bind(this);
	if(SactoryObservable.isObservable(value)) {
		this.subscribe(bind, SactoryObservable.observe(value, function(value){
			attrImpl(name, value);
		}));
	} else {
		attrImpl(name, value);
	}
};

Builder.prototype.propImpl = function(name, value){
	var o = this.element;
	if(name.charAt(0) == '@') {
		o = o.__widgets;
		name = name.substr(1);
		if(name.charAt(0) == '.') name = name.substr(1);
	}
	var s = name.split('.');
	while(s.length > 1) {
		o = o[s.shift()];
	}
	o[s[0]] = value;
};
	
Builder.prototype.prop = function(name, value, bind, type){
	var propImpl = this.propImpl.bind(this);
	if(SactoryObservable.isObservable(value)) {
		this.subscribe(bind, SactoryObservable.observe(value, function(value){
			propImpl(name, value);
		}, type));
	} else {
		propImpl(name, value);
	}
};

/**
 * @since 0.63.0
 */
Builder.prototype.append = function(element, bind, anchor){
	if(anchor && anchor.parentNode === this.element) this.element.insertBefore(element, anchor);
	else this.element.appendChild(element);
	if(bind) bind.appendChild(element);
};

/**
 * @since 0.46.0
 */
Builder.prototype.visible = function(value, reversed, bind){
	if(!hiddenAdded) {
		hiddenAdded = true;
		var style = document.createElement("style");
		style.textContent = "." + hidden + "{display:none !important;}";
		document.head.appendChild(style);
	}
	var builder = this;
	function update(value) {
		if(!!value ^ reversed) {
			builder.removeClass(hidden);
		} else {
			builder.addClass(hidden);
		}
	}
	if(SactoryObservable.isObservable(value)) {
		this.subscribe(bind, SactoryObservable.observe(value, update));
	} else {
		update(value);
	}
};

/**
 * @since 0.79.0
 */
Builder.prototype.style = function(name, value, bind){
	var node = document.createElement("style");
	var className = SactoryConfig.newPrefix();
	var wrap;
	var dot = name.indexOf('.');
	if(dot == -1) {
		wrap = function(value){
			return "." + className + name + "{" + value + "}";
		};
	} else {
		var prop = name.substr(dot + 1);
		name = name.substring(0, dot);
		wrap = function(value){
			return "." + className + name + "{" + prop + ":" + value + "}";
		};
	}
	if(SactoryObservable.isObservable(value)) {
		this.subscribe(SactoryObservable.observe(value, function(value){
			node.textContent = wrap(value);
		}));
	} else {
		node.textContent = wrap(value);
	}
	this["class"](className, bind);
	document.head.appendChild(node);
	if(bind) bind.appendChild(node);
};
	
Builder.prototype.text = function(value, bind, anchor){
	var textNode;
	if(SactoryObservable.isObservable(value)) {
		textNode = document.createTextNode("");
		this.subscribe(bind, SactoryObservable.observe(value, function(value){
			textNode.textContent = value;
			textNode.observed = true;
		}));
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
Builder.prototype.html = function(value, bind, anchor){
	var children, builder = this;
	var container = document.createElement("div");
	function parse(value, anchor) {
		container.innerHTML = value;
		children = Array.prototype.slice.call(container.childNodes, 0);
		children.forEach(function(child){
			builder.append(child, bind, anchor);
		});
	}
	if(SactoryObservable.isObservable(value)) {
		// create an anchor to maintain the right order
		var innerAnchor = SactoryBind.createAnchor(this.element, bind, anchor);
		this.subscribe(bind, value.subscribe(function(value){
			// removing children from bind context should not be necessary,
			// as they can't have any sactory-created context
			children.forEach(function(child){
				builder.element.removeChild(child);
			});
			parse(value, innerAnchor);
		}));
		parse(value.value, innerAnchor);
	} else {
		parse(value, anchor);
	}
};

/**
 * @since 0.79.0
 */
Builder.prototype["class"] = function(value, bind){
	var builder = this;
	if(SactoryObservable.isObservable(value)) {
		var lastValue = value.value || "";
		this.subscribe(bind, value.subscribe(function(newValue, oldValue){
			builder.removeClassName(oldValue || "");
			builder.addClassName(lastValue = (newValue || ""));
		}));
		this.addClassName(lastValue);
		if(bind) {
			bind.addRollback(function(){
				builder.removeClassName(lastValue);
			});
		}
	} else {
		if(!value) value = "";
		this.addClassName(value);
		if(bind) {
			bind.addRollback(function(){
				builder.removeClassName(value);
			});
		}
	}
};

/**
 * @since 0.22.0
 */
Builder.prototype.event = function(name, value, bind){
	var split = name.split(/(?<!\\):/g).map(function(a){ return a.replace(/\\\:/g, ':'); });
	var event = split.shift();
	var listener = value || function(){};
	var options = {};
	var useCapture = false;
	split.reverse().forEach(function(mod){
		var prev = listener;
		switch(mod) {
			case "prevent":
				listener = function(event){
					event.preventDefault();
					return prev.call(this, event);
				};
				break;
			case "stop":
				listener = function(event){
					event.stopPropagation();
					return prev.call(this, event);
				};
				break;
			case "once":
				options.once = true;
				break;
			case "passive":
				options.passive = true;
				break;
			case "capture":
				useCapture = true;
				break;
			case "bubble":
				useCapture = false;
				break;
			case "trusted":
				listener = function(event){
					if(event.isTrusted) return prev.call(this, event);
				};
				break;
			case "!trusted":
				listener = function(event){
					if(!event.isTrusted) return prev.call(this, event);
				};
				break;
			case "self":
				listener = function(event){
					if(event.target === this) return prev.call(this, event);
				};
				break;
			case "!self":
				listener = function(event){
					if(event.target !== this) return prev.call(this, event);
				};
				break;
			case "alt":
			case "ctrl":
			case "meta":
			case "shift":
				listener = function(event){
					if(event[mod + "Key"]) return prev.call(this, event);
				};
				break;
			case "!alt":
			case "!ctrl":
			case "!meta":
			case "!shift":
				mod = mod.substr(1);
				listener = function(event){
					if(!event[mod + "Key"]) return prev.call(this, event);
				};
				break;
			default:
				var positive = mod.charAt(0) != '!';
				if(!positive) mod = mod.substr(1);
				var dot = mod.split(/(?<!\\)\./g).map(function(a){ return a.replace(/\\\./g, '.'); });
				switch(dot[0]) {
					case "key":
						var keys = dot.slice(1).map(function(a){
							var ret = a.toLowerCase();
							if(SactoryConfig.config.event.aliases.hasOwnProperty(ret)) ret = SactoryConfig.config.event.aliases[ret];
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
									if(keys[i](event)) return prev.call(this, event);
								}
							};
						} else {
							listener = function(event){
								for(var i in keys) {
									if(keys[i](event)) return;
								}
								return prev.call(this, event);
							};
						}
						break;
					case "code":
						var keys = dot.slice(1).map(function(a){ return a.toLowerCase().replace(/-/g, ""); });
						if(positive) {
							listener = function(event){
								if(keys.indexOf(event.code.toLowerCase()) != -1) return prev.call(this, event);
							};
						} else {
							listener = function(event){
								if(keys.indexOf(event.code.toLowerCase()) == -1) return prev.call(this, event);
							};
						}
						break;
					case "keyCode":
					case "key-code":
						var keys = dot.slice(1).map(function(a){ return parseInt(a); });
						if(positive) {
							listener = function(event){
								if(keys.indexOf(event.keyCode || event.which) != -1) return prev.call(this, event);
							};
						} else {
							listener = function(event){
								if(keys.indexOf(event.keyCode || event.which) == -1) return prev.call(this, event);
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
								if(buttons.indexOf(event.button) != -1) return prev.call(this, event);
							};
						} else {
							listener = function(event){
								if(buttons.indexOf(event.button) == -1) return prev.call(this, event);
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
								if(locations.indexOf(event.location) != -1) return prev.call(this, event);
							};
						} else {
							listener = function(event){
								if(locations.indexOf(event.location) == -1) return prev.call(this, event);
							};
						}
						break;
					default:
						throw new Error("Unknown event modifier '" + mod + "'.");
				}
				break;
		}
	});
	this.element.addEventListener(event, listener, options, useCapture);
	if(bind) {
		var element = this.element;
		bind.addRollback(function(){
			element.removeEventListener(event, listener, useCapture);
		});
	}
};

/**
 * @since 0.62.0
 */
Builder.prototype.addClassName = function(className){
	if(this.element.className.length && !Polyfill.endsWith.call(this.element.className, ' ')) className = ' ' + className;
	this.element.className += className;
};

/**
 * @since 0.62.0
 */
Builder.prototype.removeClassName = function(className){
	var index = this.element.className.indexOf(className);
	if(index != -1) {
		this.element.className = (this.element.className.substring(0, index) + this.element.className.substr(index + className.length)).replace(/\s{2,}/, " ");
	}
};

/**
 * @since 0.63.0
 */
Builder.prototype[Builder.TYPE_PROP] = function(name, value, bind){
	switch(name) {
		case "visible": return this.visible(value, false, bind);
		case "hidden": return this.visible(value, true, bind);
		case "enabled":
			if(SactoryObservable.isObservable(value)) {
				this.prop("disabled", SactoryObservable.computedObservable(null, bind, [value], function(){ return !value.value; }), bind);
			} else {
				this.prop("disabled", !value, bind);
			}
			break;
		default:
			if(Polyfill.startsWith.call(name, "style:")) {
				this.style(name.substr(5), value, bind);
			} else {
				this.prop(name, value, bind);
			}
	}
};

/**
 * @since 0.69.0
 */
Builder.prototype[Builder.TYPE_ATTR] = function(name, value, bind){
	this.attr(name, value, bind);
};

/**
 * @since 0.69.0
 */
Builder.prototype[Builder.TYPE_TWOWAY] = function(name, value, bind){
	this.twoway(name, value, bind);
};

/**
 * @since 0.69.0
 */
Builder.prototype[Builder.TYPE_ADD] = function(name, value, bind, anchor){
	switch(name) {
		case "text": return this.text(value, bind, anchor);
		case "html": return this.html(value, bind, anchor);
		case "class": return this["class"](value, bind);
		default: this.event(name, SactoryObservable.unobserve(value), bind);
	}
};

/**
 * @since 0.69.0
 */
Builder.prototype[Builder.TYPE_REMOVE] = function(name, value, bind){
	value = SactoryObservable.unobserve(value);
	if(name == "class") {
		this.removeClassName(value || "");
	} else {
		this.element.removeEventListener(name, value);
	}
};

/**
 * @since 0.46.0
 */
Builder.prototype.form = function(info, value, bind){
	if(!SactoryObservable.isObservable(value)) throw new Error("Cannot two-way bind '" + this.element.tagName.toLowerCase() + "': the given value is not an observable.");
	var splitted = info.split("::");
	var events = splitted.slice(1);
	var updateType = 1048576 + Math.floor(Math.random() * 1048576);
	var inputType = this.element.type;
	var get;
	var converters = [];
	// calculate property name and default converter
	if(inputType == "checkbox") {
		this.prop("checked", value, bind, updateType);
		get = function(callback){
			callback(this.checked);
		};
	} else if(inputType == "radio") {
		// make sure that the radio buttons that depend on the same observable have
		// the same name and are in the same radio group
		if(!this.element.name) {
			this.element.name = value.radioGroupName || (value.radioGroupName = SactoryConfig.newPrefix());
		}
		// subscription that returns sets `checked` to true when the value of the
		// observable is equal to the attribute value of the element
		var element = this.element;
		this.subscribe(bind, SactoryObservable.observe(value, function(value){
			element.checked = value == element.value;
		}, updateType));
		get = function(callback){
			// the event is called only when radio is selected
			callback(this.value);
		};
	} else if(this.element.multiple) {
		// a multiple select does not bind to a property, instead it updates the options,
		// setting the selected property, everytime the observable is updated
		var options = this.element.options;
		this.subscribe(bind, SactoryObservable.observe(value, function(value){
			// options is a live collection, no need to get the value again from the element
			Array.prototype.forEach.call(options, function(option){
				option.selected = value.indexOf(option.value) != -1;
			});
		}, updateType));
		// the get function maps the values of the selected options (obtained from the
		// `selectedOptions` property or a polyfill)
		get = function(callback){
			callback(Array.prototype.map.call(selectedOptions(this), function(option){
				return option.value;
			}));
		};
	} else {
		this.prop("value", value, bind, updateType);
		get = function(callback){
			callback(this.value);
		};
	}
	// calculate the default event type if none was specified
	if(!events.length) {
		if(this.element.tagName.toUpperCase() == "SELECT") {
			events.push("change");
		} else {
			if(this.element.type == "checkbox" || this.element.type == "radio") {
				events.push("change");
			} else {
				events.push("input");
			}
		}
	}
	splitted[0].split(":").slice(1).forEach(function(mod){
		converters.push(function(){
			switch(mod) {
				case "number":
				case "num":
				case "float":
					return parseFloat;
				case "int":
				case "integer":
					return parseInt;
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
								date.setMinutes(s[0]);
								date.setSeconds(0);
								date.setMilliseconds(0);
								return date;
							};
						case "datetime-local":
						default:
							return function(){ return new Date(this); };
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
	if(value.computed && value.dependencies.length == 1 && value.dependencies[0].deep) {
		// it's the child of a deep observable
		var deep = value.dependencies[0];
		var path = deep.lastPath.slice(0, -1);
		var key = deep.lastPath[deep.lastPath.length - 1];
		converters.push(function(newValue){
			var obj = deep.value;
			path.forEach(function(p){
				obj = obj[p];
			});
			value.updateType = updateType;
			obj[key] = newValue;
		});
	} else {
		converters.push(function(newValue){
			value.updateType = updateType;
			value.value = newValue;
		});
	}
	for(var i=0; i<events.length; i++) {
		this.event(events[i], function(){
			get.call(this, function(newValue){
				converters.forEach(function(converter){
					newValue = converter.call(newValue, newValue);
				});
			});
		}, bind);
	}
};

// polyfill

if(Object.getOwnPropertyDescriptor(Element.prototype, "classList")) {

	Builder.prototype.addClass = function(className){
		this.element.classList.add(className);
	};

	Builder.prototype.removeClass = function(className){
		this.element.classList.remove(className);
	};

} else {

	Builder.prototype.addClass= function(className){
		if(!this.element.className.split(' ').indexOf(className) != -1) {
			this.element.className = (this.element.className + ' ' + className).trim();
		}
	};

	Builder.prototype.removeClass = function(className){
		this.element.className = this.element.className.split(' ').filter(function(a){
			return a != className;
		}).join(' ');
	};

}

var selectedOptions = HTMLSelectElement && Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedOptions") ? 
	function(select){
		return select.selectedOptions;
	} :
	function(select){
		return Array.prototype.filter.call(select.options, function(option){
			return option.selected;
		});
	};

module.exports = Builder;
