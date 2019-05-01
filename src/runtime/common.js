var Polyfill = require("../polyfill");
var Util = require("../util");

var Factory = {};

Factory.options = {
	minify: true
};

var NAMESPACES = {
	"xhtml": "http://www.w3.org/1999/xhtml",
	"svg": "http://www.w3.org/2000/svg",
	"mathml": "http://www.w3.org/1998/mathml",
	"xul": "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
	"xbl": "http://www.mozilla.org/xbl"
};

// templates

var definedTemplates = {};

/**
 */
Factory.defineTemplate = function(name, tagName, args, handler){
	if(typeof tagName == "function" || Array.isArray(tagName)) {
		handler = args;
		args = tagName;
		tagName = null;
	}
	if(typeof args == "function") {
		handler = args;
		args = [];
	}
	var forced = tagName && tagName.charAt(0) == '!';
	definedTemplates[name] = {
		name: name,
		tagName: forced && tagName.substr(1) || tagName,
		forced: forced,
		args: args || [],
		handler: handler
	};
};

// components

var definedComponents = {};

/**
 * @since 0.31.0
 */
Factory.defineComponent = function(name, tagName, component){
	definedComponents[name] = {
		name: name,
		tagName: tagName,
		component: component
	};
};

// init global functions used at runtime

/**
 * @since 0.32.0
 */
Factory.check = function(major, minor, patch){
	if(major != Factory.VERSION_MAJOR || minor != Factory.VERSION_MINOR) {
		throw new Error("Code transpiled using version " + major + "." + minor + "." + patch + " cannot be run in the current environment using version " + Factory.VERSION + ".");
	}
};

/**
 */
Factory.createElement = function(str, args){
	return Factory.updateElement(null, str, args);
};

/**
 * @since 0.29.0
 */
Factory.updateElement = function(element, str, args){
	
	var split = str.split('$');
	
	var tagName = split[0];
	var component;
	var templates = [];
	
	split.slice(1).forEach(function(templateName){
		var optional = templateName.charAt(0) == '?';
		if(optional) templateName = templateName.substr(1);
		var template = definedTemplates[templateName];
		if(template) {
			templates.push(template);
			if(!tagName) tagName = template.tagName;
			else if(template.forced && tagName) throw new Error("Template '" + templateName + "' forces the tag name but it's already defined.");
		} else if(!optional) {
			throw new Error("Template '" + templateName + "' could not be found.")
		}
	});
	
	var namespace;
	var templateArgs = {};
	args.forEach(function(arg){
		var remove = false;
		if(arg.key == "namespace") {
			namespace = arg.value;
		} else if(arg.key.charAt(0) == '$') {
			templateArgs[arg.key.substr(1)] = arg.value;
		} else {
			return;
		}
		arg.removed = true;
	});
	
	if(tagName && (component = definedComponents[tagName])) {
		tagName = component.tagName;
	}
	
	if(!element) {
		if(!tagName) throw new Error("No tag could be found in expression '" + str + "'.");
		if(namespace) {
			element = document.createElementNS(NAMESPACES[namespace] || namespace, tagName);
		} else {
			element = document.createElement(tagName);
		}
	}
	
	if(component) {
		element.__component = new component.component(element);
	}
	
	args.forEach(function(arg){
		if(!arg.removed) element.__builder.set(arg.key, arg.value);
	});
	
	var container = element;
	
	templates.forEach(function(template){
		// filter template-specific attributes
		var a = {};
		for(var key in templateArgs) {
			var value = templateArgs[key];
			var i = key.indexOf(':');
			if(i > 0) {
				if(key.substring(0, i) == template.name) a[key.substr(i + 1)] = value;
			} else {
				a[key] = value;
			}
		}
		container = template.handler.call(container, container, a) || container;
	});
	
	return {
		element: element,
		container: container
	};
	
};

/**
 * @since 0.36.0
 */
Factory.callImpl = function(context, element, container, fun){
	fun.call(context, container);
	return element;
};

/**
 */
Factory.call = function(context, element, fun){
	return Factory.callImpl(context, element.element, element.container, fun);
};

/**
 * @since 0.36.0
 */
Factory.callElement = function(context, element, fun){
	return Factory.callImpl(context, element, element, fun);
};

/**
 * @since 0.32.0
 */
Factory.unique = function(context, id, fun){
	var className = "__factory" + id;
	if(!document.querySelector("." + className)) {
		var element = fun.call(context);
		element.classList.add(className);
		return element;
	}
};

/**
 * @since 0.17.0
 */
Factory.append = function(element, child, afterappend, beforeremove){
	if(element) {
		element.appendChild(child);
		if(afterappend) afterappend.call(child);
		child.__builder.beforeremove = beforeremove;
	}
	return child;
};

/**
 * @since 0.36.0
 */
Factory.appendElement = function(element, child, afterappend, beforeremove){
	return Factory.append(element, child.element, afterappend, beforeremove);
};

/**
 * @since 0.32.0
 */
Factory.query = function(context, doc, selector, fun){
	if(!fun) {
		fun = selector;
		selector = doc;
		doc = document;
	}
	var elements, ret;
	if(selector instanceof Element) {
		elements = [selector];
		ret = selector;
	} else if(selector instanceof NodeList) {
		elements = ret = selector;
	} else {
		elements = ret = doc.querySelectorAll(selector);
	}
	for(var i=0; i<elements.length; i++) {
		fun.call(context, elements[i]);
	}
	return ret;
};

/**
 * @since 0.11.0
 */
Factory.bind = function(context, element, target, change, fun){
	var recordId = Util.nextId();
	var oldValue;
	function record(value) {
		element.__builder.startRecording(recordId);
		fun.call(context, element, oldValue = value);
		element.__builder.stopRecording(recordId);
	}
	if(typeof target.forEach == "function") {
		target.forEach(function(ob){
			ob.subscribe(function(){
				element.__builder.rollback(recordId);
				record();
			});
		});
		record();
	} else {
		target.subscribe(function(value){
			if(!change || change(oldValue, value)) {
				element.__builder.rollback(recordId);
				record(value);
			}
		});
		record(target());
	}
};

/**
 * @since 0.40.0
 */
Factory.bindIf = function(context, element, target, change, condition, fun){
	Factory.bind(context, element, target, change, function(element, value){
		if(condition()) fun.call(this, element, value);
	});
};

/**
 * @since 0.39.0
 */
Factory.select = function(array, selector){
	var value = [];
	array.push({s: selector, v: value});
	return value;
};

/**
 * Converts a css unit to a number and update the {@code unit} object that stores
 * the unit type.
 * @param {Object} unit - Storage for the unit. The same expression should use the same storage.
 * @param {string|*} value - The value that, if of type string, is checked for unit conversion.
 * @returns The value stripped from the unit and converted to number, if a unit was found, or the unmodified value.
 * @throws If a unit has already been used in the same expression and it's different from the current one.
 * @since 0.37.0
 */
Factory.unit = function(unit, value){
	if(typeof value == "string") {
		function check(u) {
			if(Polyfill.endsWith.call(value, u)) {
				if(unit.unit && unit.unit != u) throw new Error("Units '" + unit.unit + "' and '" + u + "' are not compatible. Use the calc() function instead.");
				unit.unit = u;
				value = parseFloat(value.substring(0, value.length - u.length));
				return true;
			}
		}
		check("cm") || check("mm") || check("in") || check("px") || check("pt") || check("pc") ||
		check("rem") || check("em") || check("ex") || check("ch") || check("vw") || check("vh") || check("vmin") || check("vmax") || check("%") ||
		check("s");
	}
	return value;
};

/**
 * Computes the result of an expression that uses {@link unit}.
 * @param {Object} unit - Storage for the unit populated by {@link unit}.
 * @param {number|*} result - The result of the expression. If a number it is checked for unit concatenation and rounded to 3 decimal places.
 * @returns the number concatenated with the unit if present, the unmodified value otherwise.
 * @since 0.37.0
 */
Factory.compute = function(unit, result){
	if(typeof result == "number" && unit.unit) {
		return Math.round(result * 1000) / 1000 + unit.unit;
	} else {
		return result;
	}
};

/**
 * Converts an object to minified CSS.
 * @since 0.19.0
 */
Factory.compilecss = function(root){
	var ret = "";
	function compile(obj) {
		for(var selector in obj) {
			var value = obj[selector];
			if(value === null) {
				ret += selector + ';';
			} else if(typeof value == "object") {
				if(Object.keys(value).length) {
					ret += selector + "{";
					compile(value);
					ret += "}";
				}
			} else {
				if(selector == "content" && (value.charAt(0) != '"' || value.charAt(value.length - 1) != '"') && (value.charAt(0) != '\'' || value.charAt(value.length - 1) != '\'')) value = JSON.stringify(value);
				ret += selector + ":" + value + ";";
			}
		}
	}
	compile(root);
	return ret;
};

/**
 * Converts an object in CSSB format to minified CSS.
 * @since 0.19.0
 */
Factory.compilecssb = function(root){
	var ret = {};
	function compile(selectors, curr, obj) {
		obj.forEach(function(value){
			if(value.s) {
				var selector = value.s;
				if(selector.charAt(0) == '@') {
					var oret = ret;
					ret = {};
					if(selector.substring(1, 6) == "media") compile(selectors, ret[selectors.join(',')] = {}, value.v);
					else compile([], {}, value.v);
					oret[selector] = ret;
					ret = oret;
				} else {
					var ns = [];
					if(selectors.length) {
						selector.split(',').map(function(s2){
							var prefix = s2.indexOf('&') != -1;
							selectors.forEach(function(s1){
								if(prefix) ns.push(s2.trim().replace('&', s1));
								else ns.push(s1 + ' ' + s2.trim());
							});
						});
					} else {
						ns = selector.split(',').map(function(s){
							return s.trim();
						});
					}
					compile(ns, ret[ns.join(',')] = {}, value.v);
				}
			} else {
				curr[value.k] = value.v || null;
			}
		});
	}
	compile([], ret, root);
	return Factory.compilecss(ret);
};

// css functions

Factory.css = {};

function Color(r, g, b, a) {
	this.r = r;
	this.g = g;
	this.b = b;
	this.a = typeof a == "number" && a || 1;
}

Color.prototype.update = function(fun){
	this.r = fun(this.r, 'r');
	this.g = fun(this.g, 'g');
	this.b = fun(this.b, 'b');
};

Color.prototype.toString = function(){
	if(this.a == 1) return '#' + [this.r, this.g, this.b].map(function(a){ return Polyfill.padStart.call(a.toString(16), 2, '0'); }).join("");
	else return "rgba(" + [this.r, this.g, this.b, this.a].join(", ") + ")";
};

Color.from = function(r, g, b, a){
	return new Color(r, g, b, a);
};

var converter;

Color.parse = function(color){
	if(!converter) converter = document.createElement("div");
	converter.style.color = "";
	converter.style.color = color;
	var conv = converter.style.color; // let the DOM handle the conversion to rgb/rgba
	if(Polyfill.startsWith.call(conv, "rgb")) {
		var a = conv.charAt(3) == 'a';
		return Color.from.apply(null, conv.substring(4 + a, conv.length - 1).split(',').map(function(a){
			return parseFloat(a);
		}));
	} else {
		throw new Error("Invalid color '" + color + "'.");
	}
};

Color.update = function(color, fun){
	color = Color.parse(color);
	color.update(fun);
	return color.toString();
};

/**
 * Converts a color of any type to RGB, removing the alpha channel if present.
 * @since 0.38.0
 */
Factory.css.rgb = function(color){
	color = Color.parse(color);
	color.a = 1;
	return color.toString();
};

/**
 * Converts a color of any type to RGBA, optionally updating the value of the alpha channel. 
 * @since 0.38.0
 */
Factory.css.rgba = function(color, alpha){
	color = Color.parse(color);
	if(arguments.length > 1) color.a = alpha;
	return color.toString();
};

/**
 * @since 0.38.0
 */
Factory.css.lighten = function(color, amount){
	if(amount > 0) amount /= 100;
	return Color.update(color, function(v){
		return v + Math.round((255 - v) * amount);
	});
};

/**
 * @since 0.38.0
 */
Factory.css.darken = function(color, amount){
	if(amount > 1) amount /= 100;
	return Color.update(color, function(v){
		return v - Math.round(v * amount);
	});
};

/**
 * @since 0.38.0
 */
Factory.css.grayscale = function(color){
	color = Color.parse(color);
	color.r = color.g = color.b = Math.round(color.r * .2989 + color.g * .587 + color.b * .114);
	return color.toString();
};

/**
 * Inverts a color.
 * @since 0.38.0
 */
Factory.css.invert = function(color){
	return Color.update(color, function(v){
		return 255 - v;
	});
};

/**
 * @since 0.38.0
 */
Factory.css.mix = function(){
	var length = arguments.length;
	var color = new Color(0, 0, 0);
	Array.prototype.forEach.call(arguments, function(c){
		Color.parse(c).update(function(v, i){
			color[i] += v;
		});
	});
	color.update(function(v){
		return Math.round(v / length);
	});
	return color.toString();
};

module.exports = Factory;
