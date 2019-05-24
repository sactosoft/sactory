var Polyfill = require("../polyfill");
var SactoryConfig = require("./config");
var SactoryObservable = require("./observable");
var SactoryBind = require("./bind");

// generate class name for hidden elements
var hidden = "__sa" + Math.floor(Math.random() * 100000);
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

/**
 * @since 0.42.0
 */
Builder.prototype.subscribe = function(bind, subscription){
	if(bind) bind.subscriptions.push(subscription);
};

Builder.prototype.propImpl = function(name, value){
	var o = this.element;
	if(name.charAt(0) == '@') {
		o = o.__component;
		name = name.substr(1);
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
 * @since 0.46.0
 */
Builder.prototype.twoway = function(name, value, bind){
	var splitted = name.split("::");
	var events = splitted.slice(1);
	name = splitted[0];
	if(["value", "checked"].indexOf(name) == -1) throw new Error("Cannot two-way bind property '" + name + "'.");
	if(!SactoryObservable.isObservable(value)) throw new Error("Cannot two-way bind property '" + name + "': the given value is not an observable.");
	if(!events.length) events.push("input");
	var type = 1048576 + Math.floor(Math.random() * 1048576);
	for(var i=0; i<events.length; i++) {
		this.event(events[i], function(){
			value.update(this.type == "number" ? parseFloat(this[name]) : this[name], type);
		}, bind);
	}
	this.prop(name, value, bind, type);
};
	
Builder.prototype.attrImpl = function(name, value){
	if(value === undefined || value === null) {
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

/**
 * @since 0.63.0
 */
Builder.prototype.append = function(element, bind, anchor){
	if(anchor && anchor.parentNode === this.element) this.element.insertBefore(element, anchor);
	else this.element.appendChild(element);
	if(bind) bind.appendChild(element);
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
 * @since 0.22.0
 */
Builder.prototype.event = function(name, value, bind){
	var split = name.split(":");
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
				var dot = mod.split('.');
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
							ret = ret.replace(/-/g, "");
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
		this.element.className = this.element.className.substring(0, index) + this.element.className.substr(index + className.length);
	}
};

/**
 * @since 0.63.0
 */
Builder.prototype.setProp = function(name, value, bind, anchor){
	switch(name) {
		default: return this.prop(name, value, bind);
		case "text": return this.text(value, bind, anchor);
		case "html": return this.html(value, bind, anchor);
		case "visible": return this.visible(value, false, bind);
		case "hidden": return this.visible(value, true, bind);
		case "enabled":
			if(SactoryObservable.isObservable(value)) {
				this.prop("disabled", SactoryObservable.computedObservable(null, bind, [value], function(){ return !value.value; }), bind);
			} else {
				this.prop("disabled", !value, bind);
			}
	}
};
	
Builder.prototype.setImpl = function(name, value, bind, anchor){
	if(name.charAt(0) == '?') {
		if(value === undefined || value === null) return;
		else name = name.substr(1);
	}
	switch(name.charAt(0)) {
		case '@':
			this.setProp(name.substr(1), value, bind, anchor);
			break;
		case '*':
			this.twoway(name.substr(1), value, bind);
			break;
		case '+':
			name = name.substr(1);
			if(name == "class") {
				var builder = this;
				if(SactoryObservable.isObservable(value)) {
					var lastValue = value.value;
					this.subscribe(bind, value.subscribe(function(newValue, oldValue){
						builder.removeClassName(oldValue);
						builder.addClassName(lastValue = newValue);
					}));
					this.addClassName(lastValue);
					if(bind) {
						bind.addRollback(function(){
							builder.removeClassName(lastValue);
						});
					}
				} else {
					this.addClassName(value);
					if(bind) {
						bind.addRollback(function(){
							builder.removeClassName(value);
						});
					}
				}
			} else {
				this.event(name, SactoryObservable.unobserve(value), bind);
			}
			break;
		case '-':
			//TODO observable and bind functionalities
			name = name.substr(1);
			if(name == "class") {
				this.removeClassName(value);
			} else {
				this.element.removeEventListener(name, SactoryObservable.unobserve(value));
			}
			break;
		default:
			this.attr(name, value, bind);
	}
};
	
Builder.prototype.set = function(name, value, bind, anchor){
	if(typeof name == "object") {
		for(var key in name) {
			this.setImpl(key, name[key], bind, anchor);
		}
	} else {
		this.setImpl(name, value, bind, anchor);
	}
	return this.element;
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

module.exports = Builder;
