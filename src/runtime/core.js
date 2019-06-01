var Polyfill = require("../polyfill");
var SactoryConfig = require("./config");

Object.defineProperty(Node, "ANCHOR_NODE", {
	writable: false,
	enumerable: true,
	configurable: false,
	value: 99
});

/**
 * @since 0.60.0
 */
function Sactory(context) {
	return new Pipe(context);
}

/**
 * @since 0.72.0
 */
Sactory.cond = function(context){
	return new ConditionalPipe(context);
};

/**
 * @class
 * @since 0.60.0
 */
function Pipe(context) {
	this.context = context;
	this.result = {};
	this.ret = undefined;
}

/**
 * @since 0.60.0
 */
Pipe.prototype.next = function(fun){
	var args = Array.prototype.slice.call(arguments, 1);
	args.unshift(this.result);
	this.ret = fun.apply(this.context, args);
	return this;
};

/**
 * @since 0.60.0
 */
Pipe.prototype.set = function(key, value){
	this.result[key] = value;
	return this;
};

/**
 * @since 0.60.0
 */
Pipe.prototype.close = function(){
	return this.ret;
};

/**
 * @since 0.72.0
 */
function ConditionalPipe(context) {
	Pipe.call(this, context);
	this.prev = true;
}

ConditionalPipe.prototype = Object.create(Pipe.prototype);

ConditionalPipe.prototype.nextIf = function(condition){
	if(this.prev = condition) Pipe.prototype.apply(this, Array.prototype.slice.call(arguments, 1));
	return this;
};

ConditionalPipe.prototype.nextElseIf = function(condition){
	if(this.prev = !this.prev && condition) Pipe.prototype.apply(this, Array.prototype.slice.call(arguments, 1));
	return this;
};

ConditionalPipe.prototype.nextElse = function(){
	if(!this.prev) Pipe.prototype.apply(this, arguments);
	return this;
};

// constants

var NAMESPACES = {
	"xhtml": "http://www.w3.org/1999/xhtml",
	"svg": "http://www.w3.org/2000/svg",
	"mathml": "http://www.w3.org/1998/mathml",
	"xul": "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
	"xbl": "http://www.mozilla.org/xbl"
};

// widgets

var widgets = {};

/**
 * Defines or replaces a widget.
 * @param {string} name - The case-sensitive name of the widget.
 * @param {class} widget - The widget class.
 * @since 0.73.0
 */
Sactory.defineWidget = function(name, widget){
	widgets[name] = widget;
};

/**
 * Removes a widget by its name.
 * @since 0.73.0
 */
Sactory.undefineWidget = function(name){
	delete widgets[name];
};

/**
 * Gets a list with the names of every registered widget.
 * @since 0.73.0
 */
Sactory.getWidgetsName = function(){
	return Object.keys(widgets);
};

/**
 * @class
 * @since 0.73.0
 */
Sactory.Widget = function(){};

/**
 * @since 0.73.0
 */
Sactory.Widget.prototype.render = function(args){
	throw new Error("Widget's 'render' prototype function not implemented.");
};

/**
 * @class
 * @since 0.73.0
 */
function SlotRegistry(name) {
	this.name = name;
	this.slots = {};
}

/**
 * @since 0.73.0
 */
SlotRegistry.prototype.add = function(anchor, name, element){
	this.slots[name || "__container"] = {element: element, anchor: anchor};
};

// init global functions used at runtime

/**
 * @since 0.32.0
 */
Sactory.check = function(major, minor, patch){
	if(major != Sactory.VERSION_MAJOR || minor != Sactory.VERSION_MINOR) {
		throw new Error("Code transpiled using version " + major + "." + minor + "." + patch + " cannot be run in the current environment using version " + Sactory.VERSION + ".");
	}
};

/**
 * @since 0.69.0
 */
Sactory.attr = function(type, name, value, optional){
	return {
		type: type,
		name: name,
		value: arguments.length > 2 ? value : "",
		optional: !!optional
	};
};

/**
 * @since 0.60.0
 */
Sactory.update = function(result, element, bind, anchor, options){
	
	var args = [];
	var widgetArgs = {};
	if(options.args) {
		// filter out optional arguments
		options.args = options.args.filter(function(a){
			return !a.optional || a.value !== undefined;
		});
		options.args.forEach(function(arg){
			if(arg.type == Builder.TYPE_WIDGET) {
				if(arg.name.length) {
					widgetArgs[arg.name] = arg.value;
				} else {
					widgetArgs = arg.value;
				}
			} else {
				args.push(arg);
			}
		});
	}

	/*if(options.spread) {
		options.spread.forEach(function(spread){
			Polyfill.assign(elementArgs, spread);
		});
	}*/

	var container, slots;
	
	if(!element) {
		var widget = widgets[options.tagName];
		if(widget) {
			slots = new SlotRegistry(options.tagName);
			var instance = new widget(widgetArgs, options.namespace);
			element = instance.render(slots, null, bind, null);
			element.__widget = element["@@"] = instance;
			if(typeof instance.onappend == "function") element.__builder.event("append", function(){ instance.onappend(element); }, bind);
			if(typeof instance.onremove == "function") element.__builder.event("remove", function(){ instance.onremove(element); }, bind);
			if(slots.slots.__container) {
				container = slots.slots.__container.element;
				result.anchor = slots.slots.__container.anchor;
			}
		} else if(options.namespace) {
			element = document.createElementNS(NAMESPACES[options.namespace] || options.namespace, options.tagName);
		} else {
			element = document.createElement(options.tagName);
		}
	}

	if(!container) container = element;
	
	args.forEach(function(arg){
		element.__builder[arg.type](arg.name, arg.value, bind, anchor);
	});
	
	Polyfill.assign(result, {
		element: element,
		container: container,
		slots: slots
	});

	return element;
	
};

/**
 * @since 0.60.0
 */
Sactory.create = function(result, bind, anchor, tagName, options){
	options.tagName = tagName;
	return Sactory.update(result, null, bind, anchor, options);
};

/**
 * @since 0.71.0
 */
Sactory.clone = function(result, element, bind, anchor, options){
	return Sactory.update(result, element.cloneNode(true), bind, anchor, options);
};

/**
 * @since 0.73.0
 */
Sactory.updateSlot = function(result, bind, anchor, options, slots, widget, slotName, fun){
	var componentSlot = (function(){
		if(slots) {
			for(var i=slots.length-1; i>=0; i--) {
				if(slots[i].name == widget) {
					for(var name in slots[i].slots) {
						if(name == slotName) return slots[i].slots[name];
					}
				}
			}
		}
	})();
	if(!componentSlot) throw new Error("Could not find slot '" + slotName + "' for widget '" + widget + "'.");
	var element = componentSlot.element && Sactory.update(result, componentSlot.element, bind, anchor, options);
	fun.call(this, element || componentSlot.anchor.parentNode, componentSlot.anchor);
	return element;
};

/**
 * @since 0.60.0
 */
Sactory.body = function(result, slots, fun){
	if(result.slots && Object.keys(result.slots.slots).length) {
		slots = (slots || []).concat(result.slots);
	}
	var element = result.container || result.element;
	fun.call(this, result.anchor ? result.anchor.parentNode : element, result.anchor, slots);
	return element;
};

/**
 * @since 0.60.0
 */
Sactory.append = function(result, parent, bind, anchor, afterappend, beforeremove){
	if(parent && parent.nodeType || typeof parent == "string" && (parent = document.querySelector(parent))) {
		if(result.anchor) anchor = result.anchor;
		if(anchor && anchor.parentNode === parent) parent.insertBefore(result.element, anchor);
		else parent.appendChild(result.element);
		if(afterappend) afterappend.call(result.element);
		if(result.element.dispatchEvent) result.element.dispatchEvent(new Event("append"));
		if(beforeremove) result.element.__builder.event("remove", beforeremove, bind);
		if(bind) bind.appendChild(result.element);
	}
	return result.element;
};

/**
 * @since 0.40.0
 */
Sactory.comment = function(element, bind, anchor, comment){
	return Sactory.append({element: document.createComment(comment)}, element, bind, anchor);
};

/**
 * @since 0.32.0
 */
Sactory.unique = function(context, id, fun){
	var className = SactoryConfig.config.prefix + id;
	if(!document.querySelector("." + className)) {
		var element = fun.call(context);
		element.__builder.addClass(className);
		return element;
	}
};

/**
 * @since 0.32.0
 */
Sactory.query = function(context, parent, selector, all, fun){
	var nodes = false;
	if(all || (nodes = typeof selector == "object" && typeof selector.length == "number")) {
		if(!nodes) {
			selector = (parent || document).querySelectorAll(selector);
		}
		Array.prototype.forEach.call(selector, function(element){
			fun.call(context, element, parent);
		});
		return selector;
	} else {
		if(typeof selector == "string") {
			selector = (parent || document).querySelector(selector);
		}
		if(selector) fun.call(context, selector, parent);
		return selector;
	}
};

/**
 * @since 0.58.0
 */
Sactory.subscribe = function(bind, observable, callback, type){
	var subscription = observable.subscribe(callback, type);
	if(bind) bind.subscribe(subscription);
	return subscription;
};

var currentId;

/**
 * @since 0.70.0
 */
Sactory.nextId = function(){
	return currentId = SactoryConfig.config.prefix + Math.floor(Math.random() * 100000);
};

/**
 * @since 0.70.0
 */
Sactory.prevId = function(){
	return currentId;
};

if(!Sactory.compilecssb) {
	Sactory.compilecssb = function(){
		throw new Error("CSSB runtime is not loaded. Either load it by using the full version of the runtime or use normal css by using the '#css' attribute.");
	};
}

if(!Sactory.bind) {
	Sactory.bind = Sactory.bindIf = Sactory.bindEach = function(){
		throw new Error("Bind runtime is not loaded. Load it by using the full version of the runtime.");
	};
}

module.exports = Sactory;
