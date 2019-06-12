var Polyfill = require("../polyfill");

var Sactory = {};

/**
 * @since 0.39.0
 */
Sactory.select = function(array, selector){
	var value = [];
	array.push({selector: selector, value: value});
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
Sactory.unit = function(unit, value){
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
Sactory.computeUnit = function(unit, result){
	if(typeof result == "number" && unit.unit) {
		return Math.round(result * 1000) / 1000 + unit.unit;
	} else {
		return result;
	}
};

Sactory.compileStyle = function(root) {
	var ret = "";
	function compile(array) {
		array.forEach(function(item){
			if(!item.value) {
				ret += item.selector + ';';
			} else if(typeof item.value == "object") {
				if(item.value.length) {
					ret += item.selector + "{";
					compile(item.value);
					ret += "}";
				}
			} else {
				if(typeof item.value != "string") item.value = item.value + "";
				ret += item.selector + ":" + item.value + ";";
			}
		});
	}
	compile(root);
	return ret;
}

/**
 * Converts an object in CSSB format to minified CSS.
 * @since 0.19.0
 */
Sactory.convertStyle = function(root){
	var ret = [];
	function compile(selectors, curr, obj) {
		obj.forEach(function(value){
			if(value.selector) {
				var selector = value.selector;
				if(selector.charAt(0) == '@') {
					var oret = ret;
					ret = [];
					if(selector.substr(1, 5) == "media" || selector.substr(1, 8) == "document") compile(selectors, Sactory.select(ret, selectors.join(',')), value.value);
					else compile([], ret, value.value);
					oret.push({selector: selector, value: ret});
					ret = oret;
				} else {
					var ns = [];
					if(selectors.length) {
						selector.split(',').map(function(s2){
							var prefix = s2.indexOf('&') != -1;
							selectors.forEach(function(s1){
								if(prefix) ns.push(s2.trim().replace(/&/g, s1));
								else ns.push(s1 + ' ' + s2.trim());
							});
						});
					} else {
						ns = selector.split(',').map(function(s){
							return s.trim();
						});
					}
					compile(ns, Sactory.select(ret, ns.join(',')), value.value);
				}
			} else {
				if(value.key.charAt(0) == '@') {
					ret.push({selector: value.key, value: value.value});
				} else {
					value.key.split(',').forEach(function(key){
						curr.push({selector: key.trim(), value: value.value});
					});
				}
			}
		});
	}
	compile([], ret, root);
	return Sactory.compileStyle(ret);
};

/**
 * Compiles a CSSB object and recompiles it each time an observable in
 * the given list changes. Also subscribes to the current bind context
 * if present.
 * @since 0.49.0
 */
Sactory.compileAndBindStyle = function(fun, element, bind, observables){
	function reload() {
		element.textContent = Sactory.convertStyle(fun());
	}
	observables.forEach(function(observable){
		var subscription = observable.subscribe(reload);
		if(bind) bind.subscribe(subscription);
	});
	reload();
};

// css functions

Sactory.css = {};

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

Color.rgb = function(color){
	var a = color.charAt(3) == 'a';
	return Color.from.apply(null, color.substring(4 + a, color.length - 1).split(',').map(function(a){
		return parseFloat(a);
	}));
};

Color.parse = function(color){
	if(!converter) converter = document.createElement("div");
	converter.style.color = "";
	converter.style.color = color;
	var conv = converter.style.color; // let the DOM handle the conversion to rgb/rgba
	if(Polyfill.startsWith.call(conv, "rgb")) {
		return Color.rgb(conv);
	} else {
		// probably a color name, try computing it
		document.head.appendChild(converter);
		conv = window.getComputedStyle(converter).color;
		document.head.removeChild(converter);
		if(Polyfill.startsWith.call(conv, "rgb")) {
			return Color.rgb(conv);
		} else {
			throw new Error("Invalid color '" + color + "'.");
		}
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
Sactory.css.rgb = function(color){
	color = Color.parse(color);
	color.a = 1;
	return color.toString();
};

/**
 * Converts a color of any type to RGBA, optionally updating the value of the alpha channel. 
 * @since 0.38.0
 */
Sactory.css.rgba = function(color, alpha){
	color = Color.parse(color);
	if(arguments.length > 1) color.a = alpha;
	return color.toString();
};

/**
 * @since 0.38.0
 */
Sactory.css.lighten = function(color, amount){
	if(amount > 0) amount /= 100;
	return Color.update(color, function(v){
		return v + Math.round((255 - v) * amount);
	});
};

/**
 * @since 0.38.0
 */
Sactory.css.darken = function(color, amount){
	if(amount > 1) amount /= 100;
	return Color.update(color, function(v){
		return v - Math.round(v * amount);
	});
};

/**
 * @since 0.38.0
 */
Sactory.css.grayscale = function(color){
	color = Color.parse(color);
	color.r = color.g = color.b = Math.round(color.r * .2989 + color.g * .587 + color.b * .114);
	return color.toString();
};

/**
 * Inverts a color.
 * @since 0.38.0
 */
Sactory.css.invert = function(color){
	return Color.update(color, function(v){
		return 255 - v;
	});
};

/**
 * @since 0.38.0
 */
Sactory.css.mix = function(){
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

/**
 * @since 0.85.0
 */
Sactory.css.random = function(){
	function color() {
		return Polyfill.padStart.call(Math.floor(Math.random() * 256).toString(16), 2, '0');
	}
	return '#' + color() + color() + color();
};

module.exports = Sactory;
