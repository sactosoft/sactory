var Polyfill = require("../polyfill");
var SactoryObservable = require("./observable");

var colors = require("../json/colors.json");

var Sactory = {};

function SelectorHolder() {
	this.content = [];
}

SelectorHolder.prototype.value = function(key, value){
	this.content.push({key, value});
};

SelectorHolder.prototype.stat = function(stat){
	this.content.push({key: stat});
};

SelectorHolder.prototype.spread = function(props){
	for(var key in props) {
		this.value(key, props[key]);
	}
};

/**
 * @since 0.99.0
 */
Sactory.root = function(){
	return new SelectorHolder();
};

/**
 * @since 0.99.0
 */
Sactory.select = function(parent, selector){
	var ret = new SelectorHolder();
	parent.content.push({selector: selector, value: ret.content});
	return ret;
};

var units = ["px", "%", "rem", "em", "s", "pt", "vh", "vw", "vmin", "vmax", "cm", "mm", "in", "pc", "ex", "ch"];

/** 
 * @since 0.130.0
 */
Sactory.computeUnit = Sactory.cu = function(fun){
	var unit = "";
	var value = fun(value => {
		if(typeof value == "string") {
			for(var i in units) {
				var u = units[i];
				if(Polyfill.endsWith.call(value, u)) {
					var number = +value.slice(0, -u.length);
					if(!isNaN(number)) {
						if(unit && unit != u) {
							throw new Error(`Units '${unit}' and '${u}' are not compatible. Use the calc() css function instead.`);
						} else {
							unit = u;
							return number;
						}
					}
				}
			}
		}
		return value;
	});
	return typeof value == "number" ? Math.round(value * 10000) / 10000 + unit : value;
};

Sactory.compileStyle = function(root) {
	var ret = "";
	function compile(array) {
		array.forEach(function(item){
			if(item.plain) {
				if(!item.value) {
					ret += item.selector + ';';
				} else {
					ret += item.selector + ":" + item.value + ";";
				}
			} else if(item.value.length) {
				ret += item.selector + "{";
				compile(item.value);
				ret += "}";
			}
		});
	}
	compile(root);
	return ret;
}

/**
 * Converts an object in SSB format to minified CSS.
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
					if(selector.substr(1, 5) == "media" || selector.substr(1, 8) == "document") compile(selectors, Sactory.select({content: ret}, selectors.join(',')).content, value.value);
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
					compile(ns, Sactory.select({content: ret}, ns.join(',')).content, value.value);
				}
			} else {
				if(value.key.charAt(0) == '@') {
					ret.push({plain: true, selector: value.key, value: value.value});
				} else {
					value.key.split(',').forEach(function(key){
						curr.push({plain: true, selector: key.trim(), value: value.value});
					});
				}
			}
		});
	}
	compile([], ret, root);
	return Sactory.compileStyle(ret);
};

/**
 * Compiles a SSB object and recompiles it each time an observable in
 * the given list changes. Also subscribes to the current bind context
 * if present.
 * @since 0.49.0
 */
Sactory.compileAndBindStyle = Sactory.cabs = function({counter, element, bind, selector}, fun, observables, maybe){
	var className = element["~builder"].scopedClassName = counter.nextPrefix();
	var conv = selector ? value => ([{selector, value}]) : value => value;
	var observable = Sactory.coff(() => element.textContent = Sactory.convertStyle(conv(fun(className, Sactory.css))));
	observable.addDependencies(observables, bind);
	observable.addMaybeDependencies(maybe, bind);
};

/**
 * @since 0.129.0
 */
Sactory.scope = function({counter, element, bind}){
	var builder = element["~builder"];
	var className = builder.scopedClassName;
	var add = () => {
		var builder = element.parentNode["~builder"];
		builder.addClass(className);
		if(bind) bind.addRollback(() => builder.removeClass(className));
	};
	if(element.parentNode) {
		add();
	} else {
		builder.event("append", add, bind);
	}
};

// css functions

Sactory.css = {};

/**
 * @since 0.94.0
 */
Sactory.css.quote = function(value){
	return JSON.stringify(value + "");
};

function Color(type) {
	this.type = type;
}

Color.prototype.toJSON = function(){
	return this.toString();
};

function RGBColor(r, g, b, a) {
	Color.call(this, "rgb");
	this.r = r;
	this.g = g;
	this.b = b;
	this.a = typeof a == "number" ? a : 1;
}

RGBColor.prototype = Object.create(Color.prototype);

RGBColor.prototype.update = function(fun){
	this.r = fun(this.r, 'r');
	this.g = fun(this.g, 'g');
	this.b = fun(this.b, 'b');
};

RGBColor.prototype.toHSL = function(){

	var min = Math.min(this.r, this.g, this.b);
	var max = Math.max(this.r, this.g, this.b);

	var h, s, l = (max + min) / 2;

	if(max == min) {

		// achromatic
		h = s = 0;

	} else {

		var delta = max - min;

		// saturation
		s = l > .5 ? delta / (2 - max - min) : delta / (max + min);

		// hue
		if(delta == 0) {
			h = 0;
		} else if(max == this.r) {
			h = ((this.g - this.b) / delta) % 6;
		} else if(max == this.g) {
			h = (this.b - this.r) / delta + 2;
		} else {
			h = (this.r - this.g) / delta + 4;
		}
		h /= 6;

	}

	return new HSLColor(h, s, l, this.a);

};

function multiply(number) {
	return Math.round(number * 255);
}

RGBColor.prototype.toHexString = function(){
	return '#' + [this.r, this.g, this.b].map(multiply).map(function(a){ return Polyfill.padStart.call(a.toString(16), 2, '0'); }).join("");
};

RGBColor.prototype.toRGBString = function(){
	return "rgb(" + [this.r, this.g, this.b].map(multiply).join(", ") + ")";
};

RGBColor.prototype.toRGBAString = function(){
	return "rgba(" + [this.r, this.g, this.b].map(multiply).join(", ") + ", " + this.a + ")";
};

RGBColor.prototype.toString = function(){
	if(this.a == 1) return this.toHexString();
	else return this.toRGBAString();
};

RGBColor.fromHexString = function(color){
	if(color.length == 3) {
		function parse(num) {
			return parseInt(num, 16) / 15;
		}
		return new RGBColor(parse(color.charAt(0)), parse(color.charAt(1)), parse(color.charAt(2)));
	} else {
		function parse(num) {
			return parseInt(num, 16) / 255;
		}
		return new RGBColor(parse(color.substring(0, 2)), parse(color.substring(2, 4)), parse(color.substring(4, 6)));
	}
};

RGBColor.from = function(color){
	if(color instanceof RGBColor) return new RGBColor(color.r, color.g, color.b, color.a);
	else if(color.toRGB) return color.toRGB();
	else return RGBColor.from(parseColor(color));
};

/**
 * @class
 * @since 0.100.0
 */
function HSLColor(h, s, l, a) {
	Color.call(this, "hsl");
	this.h = h;
	this.s = s;
	this.l = l;
	this.a = typeof a == "number" ? a : 1;
}

HSLColor.prototype = Object.create(Color.prototype);

HSLColor.prototype.toHSLString = function(){
	return "hsl(" + Math.round(this.h * 360) + ", " + Math.round(this.s * 100) + "%, " + Math.round(this.l * 100) + "%)";
};

HSLColor.prototype.toHSLAString = function(){
	return "hsla(" + Math.round(this.h * 360) + ", " + Math.round(this.s * 100) + "%, " + Math.round(this.l * 100) + "%, " + this.a + ")";
};

HSLColor.prototype.toString = function(){
	if(this.a == 1) return this.toHSLString();
	else return this.toHSLAString();
};

HSLColor.prototype.toRGB = function(){

	var c = (1 - Math.abs(2 * this.l - 1)) * this.s;
	var x = c * (1 - Math.abs((this.h * 6) % 2 - 1));
	var m = this.l - c / 2;

	var r, g, b;

	if(this.h < 1 / 6) {
		r = c;
		g = x;
		b = 0;
	} else if(this.h < 2 / 6) {
		r = x;
		g = c;
		b = 0;
	} else if(this.h < 3 / 6) {
		r = 0;
		g = c;
		b = x;
	} else if(this.h < 4 / 6) {
		r = 0;
		g = x;
		b = c;
	} else if(this.h < 5 / 6) {
		r = x;
		g = 0;
		b = c;
	} else {
		r = c;
		g = 0;
		b = x;
	}

	return new RGBColor(r + m, g + m, b + m, this.a);

};

HSLColor.from = function(color){
	if(color instanceof HSLColor) return new HSLColor(color.h, color.s, color.l, color.a);
	else if(color.toHSL) return color.toHSL();
	else return HSLColor.from(parseColor(color));
};

/*
 * @since 0.100.0
 */
function parseColor(color) {
	if(color.charAt(0) == '#') {
		return RGBColor.fromHexString(color.substr(1));
	} else {
		var p = color.indexOf('(');
		if(p > 0) {
			var type = color.substring(0, p);
			var values = color.slice(p + 1, -1).split(',');
			var alpha = values.length > 3 ? +values[3] : undefined;
			switch(type) {
				case "rgb":
				case "rgba":
					return new RGBColor(values[0] / 255, values[1] / 255, values[2] / 255, alpha);
				case "hsl":
				case "hsla":
					return new HSLColor(values[0] / 360, values[1].slice(0, -1) / 100, values[2].slice(0, -1) / 100, alpha);
				default:
					throw new Error("Unknown color format '" + type + "'");
			}
		} else {
			return parseTextualColor(color);
		}
	}
}

var parseTextualColor = typeof colors == "object" ? function(color){
	if(colors.hasOwnProperty(color)) {
		return RGBColor.fromHexString(colors[color]);
	} else {
		return new RGBColor(0, 0, 0);
	}
} : function(color){
	// use window.getComputedStyle to convert the color to rgb
	var conv = document.createElement("div");
	conv.style.color = color;
	document.head.appendChild(conv);
	color = window.getComputedStyle(conv).color;
	document.head.removeChild(conv);
	return parseColor(color);
};

function random(T, alpha) {
	return new T(Math.random(), Math.random(), Math.random(), alpha ? Math.random() : undefined);
}

/**
 * Converts a color of any type to RGB, removing the alpha channel if present.
 * If no parameters are given, a random color is returned.
 * @since 0.38.0
 */
Sactory.css.rgb = function(color){
	if(arguments.length) {
		color = RGBColor.from(parseColor(color));
		color.a = 1;
		return color;
	} else {
		return random(RGBColor, false);
	}
};

/**
 * Converts a color of any type to RGBA, optionally updating the value of the alpha channel. 
 * If no parameters are given, a random color is returned.
 * @since 0.38.0
 */
Sactory.css.rgba = function(color, alpha){
	if(arguments.length) {
		color = RGBColor.from(color);
		if(arguments.length > 1) color.a = alpha;
		return color;
	} else {
		return random(RGBColor, true);
	}
};

/**
 * Converts a color of any type to HSL, removing the alpha channel if present.
 * If no parameters are given, a random color is returned.
 * @since 0.100.0
 */
Sactory.css.hsl = function(color){
	if(arguments.length) {
		color = HSLColor.from(color);
		color.a = 1;
		return color;
	} else {
		return random(HSLColor, false);
	}
};

/**
 * Converts a color of any type to HSLA, optionally updating the value of the alpha channel. 
 * If no parameters are given, a random color is returned.
 * @since 0.100.0
 */
Sactory.css.hsla = function(color, alpha){
	if(arguments.length) {
		color = HSLColor.from(color);
		if(arguments.length > 1) color.a = alpha;
		return color;
	} else {
		return random(HSLColor, true);
	}
};

/**
 * @since 0.38.0
 */
Sactory.css.lighten = function(color, amount){
	color = HSLColor.from(color);
	color.l += (1 - color.l) * amount;
	return color;
};

/**
 * @since 0.38.0
 */
Sactory.css.darken = function(color, amount){
	color = HSLColor.from(color);
	color.l *= (1 - amount);
	return color;
};

/**
 * @since 0.100.0
 */
Sactory.css.saturate = function(color, amount){
	color = HSLColor.from(color);
	color.s += (1 - color.s) * amount;
	return color;
};

/**
 * @since 0.100.0
 */
Sactory.css.desaturate = function(color, amount){
	color = HSLColor.from(color);
	color.s *= (1 - amount);
	return color;
};

/**
 * @since 0.38.0
 */
Sactory.css.grayscale = Sactory.css.greyscale = function(color){
	color = RGBColor.from(color);
	color.r = color.g = color.b = color.r * .2989 + color.g * .587 + color.b * .114;
	return color;
};

/**
 * Inverts a color.
 * @since 0.38.0
 */
Sactory.css.invert = function(color){
	color = RGBColor.from(color);
	color.update(function(v){
		return 1 - v;
	});
	return color;
};

/**
 * @since 0.100.0
 */
Sactory.css.pastel = function(color){
	if(arguments.length) {
		color = HSLColor.from(color);
		color.s = .9 + color.s * .1;
		color.l = .75 + color.l * .15;
		return color;
	} else {
		return new HSLColor(Math.random(), .9 + Math.random() * .1, .75 + Math.random() * .15);
	}
};

/**
 * @since 0.102.0
 */
Sactory.css.sepia = function(color){
	color = RGBColor.from(color);
	return new RGBColor(
		color.r * .393 + color.g * .769 + color.b * .189,
		color.r * .349 + color.g * .686 + color.b * .168,
		color.r * .272 + color.g * .534 + color.b * .131,
		color.a
	);
};

/**
 * @since 0.38.0
 */
Sactory.css.mix = function(){
	var length = arguments.length;
	var color = new RGBColor(0, 0, 0);
	Array.prototype.forEach.call(arguments, function(c){
		RGBColor.from(c).update(function(v, i){
			color[i] += v;
		});
	});
	color.update(function(v){
		return v / length;
	});
	return color;
};

/**
 * @since 0.100.0
 */
Sactory.css.contrast = function(color, light, dark){
	color = RGBColor.from(color);
	color.update(function(value){
		if(value <= .03928) {
			return value / 12.92;
		} else {
			return Math.pow((value + .055) / 1.055, 2.4);
		}
	});
	return color.r * .2126 + color.g * .7152 + color.b * .0722 > .179 ? (dark || "#000") : (light || "#fff");
};

module.exports = Sactory;
