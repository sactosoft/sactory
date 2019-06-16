var Polyfill = require("../polyfill");
var Builder = require("./builder");
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
function Sactory(context, element, bind, anchor) {
	var context = {
		context: context,
		element: element,
		container: element,
		bind: bind,
		anchor: anchor
	};
	for(var i=4; i<arguments.length; i++) {
		var args = arguments[i];
		var fun = args[0];
		args[0] = context;
		fun.apply(null, args);
	}
	return context.element;
}

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
 * Indicates whether a widget with the given name exists.
 * @since 0.89.0
 */
Sactory.hasWidget = function(name){
	return widgets.hasOwnProperty(name);
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
	/* debug:
	if(element) {
		element.setAttribute(":slot", (element.hasAttribute(":slot") ? element.getAttribute(":slot") + "," : "") + (name || "__container"));
	}
	*/
};

// init global functions used at runtime

/**
 * @since 0.80.0
 */
Sactory.noop = function(){};

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
Sactory.update = function(context, options){
	
	var args = [];
	var widgetArgs = {};
	var widgetExt = {};

	if(options.args) {
		// filter out optional arguments
		options.args = options.args.filter(function(a){
			return !a.optional || a.value !== undefined;
		});
		options.args.forEach(function(arg){
			var ext = arg.type == Builder.TYPE_EXTEND_WIDGET;
			if(ext || arg.type == Builder.TYPE_WIDGET) {
				var obj;
				if(ext) {
					var col = arg.name.indexOf(':');
					if(col == -1) {
						widgetExt[arg.name] = arg.value;
						return;
					} else {
						obj = widgetExt[arg.name.substring(0, col)] = {};
						arg.name = arg.name.substr(col + 1);
					}
				} else {
					if(arg.name.length) {
						obj = widgetArgs;
					} else {
						widgetArgs = arg.value;
						return;
					}
				}
				var splitted = arg.name.split('.');
				if(splitted.length > 1) {
					for(var i=0; i<splitted.length-1; i++) {
						var k = splitted[i];
						if(typeof obj[k] != "object") obj[k] = {};
						obj = obj[k];
					}
					obj[splitted[splitted.length - 1]] = arg.value;
				} else {
					obj[arg.name] = arg.value;
				}
			} else {
				args.push(arg);
			}
		});
	}

	if(options.spread) {
		options.spread.forEach(function(spread){
			for(var key in spread) {
				args.push({type: Builder.TYPE_ATTR, name: key, value: spread[key]});
			}
		});
	}
	
	if(!context.element) {
		var widget = widgets[options.tagName];
		if(widget && options.widget !== false) {
			context.slots = new SlotRegistry(options.tagName);
			if(widget.prototype && widget.prototype.render) {
				var instance = new widget(widgetArgs, options.namespace);
				context.element = instance.render(context.slots, null, context.bind, null);
				context.element.__builder.widget = context.element.__builder.widgets[options.tagName] = instance;
				if(typeof instance.onappend == "function") context.element.__builder.event("append", function(){ instance.onappend(context.element); }, context.bind);
				if(typeof instance.onremove == "function") context.element.__builder.event("remove", function(){ instance.onremove(context.element); }, context.bind);
			} else {
				context.element = widget(context.slots, null, context.bind, null, widgetArgs, options.namespace);
			}
			if(context.slots.slots.__container) {
				context.container = context.slots.slots.__container.element;
				context.anchor = context.slots.slots.__container.anchor;
			} else {
				context.container = context.element;
			}
			/* debug:
			context.element.setAttribute(":widget", options.tagName);
			*/
		} else {
			if(options.namespace) {
				context.element = context.container = document.createElementNS(NAMESPACES[options.namespace] || options.namespace, options.tagName);
			} else {
				context.element = context.container = document.createElement(options.tagName);
			}
			/* debug:
			if(context.element.setAttribute) {
				context.element.setAttribute(":created", "");
			}
			*/
		}
	}

	args.sort(function(a, b){
		return a.type - b.type;
	});
	
	args.forEach(function(arg){
		context.element.__builder[arg.type](arg.name, arg.value, context.bind, context.anchor, context.context);
	});

	if(options.transitions) {
		options.transitions.forEach(function(transition){
			context.element.__builder.addAnimation(transition[0], transition[1], transition[2] || {});
		});
	}

	for(var widgetName in widgetExt) {
		if(!widgets.hasOwnProperty(widgetName)) throw new Error("Widget '" + widgetName + "' could not be found.");
		var widget = widgets[widgetName];
		if(widget.prototype && widget.prototype.render) {
			var instance = new widgets[widgetName](widgetExt[widgetName]);
			instance.render(new SlotRegistry(""), context.element, context.bind, null);
			context.element.__builder.widgets[widgetName] = instance;
		} else {
			widget(new SlotRegistry(""), context.element, context.bind, null, widgetExt[widgetName]);
		}
		/* debug:
		context.element.setAttribute(":extend:" + widgetName, "");
		*/
	}

	/* debug:
	if(context.element.setAttribute) {
		context.element.setAttribute(":id", context.element.__builder.runtimeId);
	}
	*/
	
};

/**
 * @since 0.60.0
 */
Sactory.create = function(context, tagName, options){
	options.tagName = tagName;
	context.element = context.container = null; // delete parents
	context.anchor = null; // invalidate the current anchor so the children will not use it
	Sactory.update(context, options);
};

/**
 * @since 0.80.0
 */
Sactory.createOrUpdate = function(context, condition, tagName, options){
	if(condition) {
		Sactory.update(context, options);
	} else {
		Sactory.create(context, tagName, options);
	}
};

/**
 * @since 0.71.0
 */
Sactory.clone = function(context, options){
	context.element = context.container = context.element.cloneNode(true);
	context.anchor = null; // invalidate the current anchor so the children will not use it
	Sactory.update(context, options);
};

/**
 * @since 0.73.0
 */
Sactory.updateSlot = function(context, options, slots, widget, slotName, fun){
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
	if(componentSlot.element) {
		context.element = componentSlot.element;
		Sactory.update(context, options);
	}
	fun.call(context.context, componentSlot.anchor ? componentSlot.anchor.parentNode : context.element, componentSlot.anchor);
};

/**
 * @since 0.60.0
 */
Sactory.body = function(context, slots, fun){
	if(context.slots && Object.keys(context.slots.slots).length) {
		slots = (slots || []).concat(context.slots);
	}
	fun.call(context.context, context.container, context.anchor, slots);
};

/**
 * @since 0.82.0
 */
Sactory.forms = function(context){
	Array.prototype.slice.call(arguments, 1).forEach(function(value){
		context.element.__builder.form(value[0], value[1], context.bind);
	});
};

/**
 * @since 0.60.0
 */
Sactory.append = function(context, parent, anchor, afterappend, beforeremove){
	if(parent && parent.nodeType || typeof parent == "string" && (parent = document.querySelector(parent))) {
		if(anchor && anchor.parentNode === parent) parent.insertBefore(context.element, anchor);
		else parent.appendChild(context.element);
		if(afterappend) afterappend.call(context.element);
		if(context.element.__builder && context.element.dispatchEvent) context.element.__builder.dispatchEvent("append");
		if(beforeremove) context.element.__builder.event("remove", beforeremove, context.bind);
		if(context.bind) context.bind.appendChild(context.element);
	}
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
Sactory.query = function(context, doc, parent, selector, all, fun){
	var nodes = false;
	if(all || (nodes = selector && typeof selector == "object" && typeof selector.length == "number")) {
		if(!nodes) {
			selector = doc.querySelectorAll(selector);
		}
		Array.prototype.forEach.call(selector, function(element){
			fun.call(context, element, parent);
		});
		return selector;
	} else {
		if(typeof selector == "string") {
			selector = doc.querySelector(selector);
		}
		if(selector) fun.call(context, selector, parent);
		return selector;
	}
};

/**
 * @since 0.90.0
 */
Sactory.mixin = function(element, bind, anchor, data){
	if(data instanceof Node) {
		Sactory.append({element: data, bind: bind}, element, anchor);
	} else {
		Sactory.html(element, bind, anchor, data);
	}
};

/**
 * @since 0.78.0
 */
Sactory.text = function(element, bind, anchor, text){
	if(element) element.__builder.text(text, bind, anchor);
};

/**
 * @since 0.78.0
 */
Sactory.html = function(element, bind, anchor, html){
	if(element) element.__builder.html(html, bind, anchor);
};

/**
 * @since 0.40.0
 */
Sactory.comment = function(element, bind, anchor, comment){
	var ret = document.createComment(comment);
	Sactory.append({element: ret, bind: bind}, element, anchor);
	return ret;
};

/**
 * @since 0.78.0
 */
Sactory.on = function(context, element, bind, name, value){
	if(arguments.length == 6) {
		arguments[3].__builder.event(context, arguments[4], arguments[5], bind);
	} else {
		element.__builder.event(context, name, value, bind);
	}
};

/**
 * @since 0.88.0
 */
Sactory.widget = function(element, name){
	if(name) {
		return element.__builder.widgets[name] || null;
	} else {
		return element.__builder.widget || null;
	}
};

var currentId;

/**
 * @since 0.70.0
 */
Sactory.nextId = function(){
	return currentId = SactoryConfig.newPrefix();
};

/**
 * @since 0.70.0
 */
Sactory.prevId = function(){
	return currentId;
};

/**
 * @since 0.93.0
 */
Sactory.ready = function(callback){
	if(document.readyState == "complete") {
		callback();
	} else {
		window.addEventListener("load", callback);
	}
};

/* debug:
Object.defineProperty(Sactory, "debug", {
	value: true
});
*/

module.exports = Sactory;
