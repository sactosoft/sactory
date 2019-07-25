var Polyfill = require("../polyfill");
var Const = require("../const");
var { hyphenate } = require("../util");
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
function Sactory(scope, context, element) {
	var context = {
		__sactory: true,
		scope: scope,
		element: element,
		content: element,
		bind: context.bind,
		anchor: context.anchor,
		parentAnchor: context.anchor,
		registry: context.registry
	};
	for(var i=3; i<arguments.length; i++) {
		var args = arguments[i];
		var fun = args[0];
		args[0] = context;
		fun.apply(null, args);
	}
	return context.element;
}

// constants

Sactory.NS_XHTML = "http://www.w3.org/1999/xhtml";
Sactory.NS_SVG = "http://www.w3.org/2000/svg";
Sactory.NS_MATHML = "http://www.w3.org/1998/mathml";
Sactory.NS_XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
Sactory.NS_XBL = "http://www.mozilla.org/xbl";

Sactory.SL_CONTAINER = "__container";
Sactory.SL_CONTENT = "__content";
Sactory.SL_INPUT = "__input";

// widgets

var widgets = {};

/**
 * Defines or replaces a widget.
 * @param {string} name - The case-sensitive name of the widget.
 * @param {class} widget - The widget class.
 * @since 0.73.0
 */
Sactory.addWidget = function(name, widget){
	if(widget) {
		widgets[name] = widget;	
	} else if(name && name.name) {
		widgets[hyphenate(name.name)] = name;
	} else {
		throw new Error("Cannot add widget: invalid or missing name.");
	}
};

/**
 * Checks whether the given version in compatible with the runtime version.
 * @throws {Error} When the given version is not compatible with the runtime version.
 * @since 0.32.0
 */
Sactory.check = function(v){
	var transpiled = v.split('.');
	var runtime = Sactory.VERSION.split('.');
	if(transpiled[0] != runtime[0] || transpiled[1] != runtime[1]) {
		throw new Error("Code transpiled using version " + v + " cannot be run in the current runtime environment using version " + Sactory.VERSION + ".");
	}
};

/**
 * Removes a widget by its name.
 * @since 0.73.0
 */
Sactory.removeWidget = function(name){
	if(typeof name != "string") name = hyphenate(name.name);
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
 * Gets the instance of the widget with the given name.
 * @since 0.112.0
 */
Sactory.getWidget = function(name){
	return widgets[name];
};

/**
 * Gets a list with the names of every registered widget.
 * @since 0.73.0
 */
Sactory.getWidgetsNames = function(){
	return Object.keys(widgets);
};

/**
 * Gets the widget with the given name associated to the
 * given element.
 * If no name is given the main widget is returned.
 * @since 0.112.0
 */
Sactory.widget = function(element, name){
	return element.__builderInstance && (name ? element.__builder.widgets[name] : element.__builder.widget);
};

/**
 * @class
 * @since 0.73.0
 */
Sactory.Widget = function(){};

Sactory.Widget.prototype.element = null;

/**
 * @since 0.73.0
 */
Sactory.Widget.prototype.render = function(args){
	throw new Error("Widget's 'render' prototype function not implemented.");
};

/**
 * @since 0.94.0
 */
Sactory.Widget.prototype.dispatchEvent = function(event){
	if(!this.element) throw new Error("Cannot dispatch event: the widget has not been rendered yet.");
	this.element.__builder.dispatchEvent(event);
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
	this.slots[name || Sactory.SL_CONTENT] = {element: element, anchor: anchor};
	/* debug:
	if(element) {
		element.setAttribute(":slot", (element.hasAttribute(":slot") ? element.getAttribute(":slot") + "," : "") + (name || Sactory.SL_CONTENT));
	}
	*/
};

/**
 * @since 0.104.0
 */
SlotRegistry.prototype.addAll = function(anchor, names, element){
	for(var i in names) {
		this.add(anchor, names[i], element);
	}
};

/**
 * @since 0.113.0
 */
SlotRegistry.prototype.applyTo = function(element, main){
	element.__builder.slots[this.name] = this.slots;
	if(main) element.__builder.slots.__main = this.slots;
};

// init global functions used at runtime

/**
 * Does literally nothing.
 * @since 0.80.0
 */
Sactory.noop = function(){};

/**
 * @since 0.60.0
 */
Sactory.update = function(context, options){
	
	var args = [];
	var widgetArgs = {};
	var widgetExt = {};
	var widgetExtAnon = [];

	if(options[Const.ARG_TYPE_INTERPOLATED_ATTRIBUTES]) {
		if(!options[Const.ARG_TYPE_ATTRIBUTES]) options[Const.ARG_TYPE_ATTRIBUTES] = [];
		options[Const.ARG_TYPE_INTERPOLATED_ATTRIBUTES].forEach(function(iattrs){
			iattrs[3].forEach(function(iattr){
				options[Const.ARG_TYPE_ATTRIBUTES].push([iattrs[0], iattrs[1], iattrs[2] + iattr + iattrs[4]]);
			});
		});
	}

	if(options[Const.ARG_TYPE_ATTRIBUTES]) {
		// filter out optional arguments
		options[Const.ARG_TYPE_ATTRIBUTES] = options[Const.ARG_TYPE_ATTRIBUTES].filter(function(a){
			return !a[3] || a[0] !== undefined;
		});
		options[Const.ARG_TYPE_ATTRIBUTES].forEach(function(arg){
			var ext = arg[1] == Const.BUILDER_TYPE_EXTEND_WIDGET;
			if(ext || arg[1] == Const.BUILDER_TYPE_WIDGET) {
				var name = arg[2];
				var value = arg[0];
				var obj;
				if(ext) {
					if(typeof name == "function") {
						widgetExtAnon.push({
							widget: name,
							args: value
						});
						return;
					} else {
						var col = name.indexOf(':');
						if(col == -1) {
							widgetExt[name] = value;
							return;
						} else {
							var key = name.substring(0, col);
							if(!widgetExt.hasOwnProperty(key)) obj = widgetExt[key] = {};
							else obj = widgetExt[key];
							name = name.substr(col + 1);
						}
					}
				} else {
					if(name.length) {
						obj = widgetArgs;
					} else {
						widgetArgs = value;
						return;
					}
				}
				var splitted = name.split('.');
				if(splitted.length > 1) {
					for(var i=0; i<splitted.length-1; i++) {
						var k = splitted[i];
						if(typeof obj[k] != "object") obj[k] = {};
						obj = obj[k];
					}
					obj[splitted[splitted.length - 1]] = value;
				} else {
					obj[name] = value;
				}
			} else {
				args.push(arg);
			}
		});
	}

	if(options[Const.ARG_TYPE_SPREAD]) {
		options[Const.ARG_TYPE_SPREAD].forEach(function(spread){
			for(var key in spread[1]) {
				args.push([spread[1][key], spread[0], key]);
			}
		});
	}
	
	if(!context.element) {
		var parentWidget, widget;
		function getWidget(name) {
			if(Polyfill.startsWith.call(name, "::")) {
				if(context.parent) {
					parentWidget = context.parent.__builder.widget;
					return parentWidget && parentWidget[name.substr(1)];
				}
			} else {
				var column = options.tagName.lastIndexOf(':');
				if(column == -1) {
					return widgets[name];
				} else {
					var name = options.tagName.substring(0, column);
					if(name == "this") {
						parentWidget = context.scope;
					} else if(context.parent) {
						parentWidget = context.parent.__builder.widgets[name];
					}
					return parentWidget && parentWidget[':' + options.tagName.substr(column + 1)];
				}
			}
		}
		if(!options.hasOwnProperty(Const.ARG_TYPE_WIDGET) && (widget = getWidget(options.tagName)) || (widget = typeof options.tagName == "function" && options.tagName)) {
			var registry = new SlotRegistry(options.tagName);
			var newContext = Polyfill.assign({}, context, {element: null, anchor: null, registry: registry});
			if(widget.prototype && widget.prototype.render) {
				var instance = new widget(widgetArgs, options[Const.ARG_TYPE_NAMESPACE]);
				var ret = context.element = instance.__element = instance.render(newContext);
				if(instance instanceof Sactory.Widget) instance.element = instance.__element;
				if(!(ret instanceof Node)) throw new Error("The widget's render function did not return an instance of 'Node', returned '" + ret + "' instead.");
				context.element.__builder.widget = context.element.__builder.widgets[options.tagName] = instance;
			} else {
				context.element = widget.call(parentWidget, newContext, widgetArgs, options[Const.ARG_TYPE_NAMESPACE]);
				if(!(context.element instanceof Node)) throw new Error("The widget did not return an instance of 'Node', returned '" + context.element + "' instead.");
			}
			registry.applyTo(context.element, true);
			if(registry.slots[Sactory.SL_CONTENT]) {
				var content = registry.slots[Sactory.SL_CONTENT];
				context.content = content.element || content.anchor.parentNode;
				context.anchor = content.anchor;
			} else {
				context.content = context.element;
			}
			if(registry.slots[Sactory.SL_CONTAINER]) context.element = context.container = registry.slots[Sactory.SL_CONTAINER].element;
			if(registry.slots[Sactory.SL_INPUT]) context.input = registry.slots[Sactory.SL_INPUT].element;
			/* debug:
			if(context.element.setAttribute) {
				if(typeof options.tagName == "function") {
					context.element.setAttribute(":widget.anonymous", options.tagName.name);
				} else {
					context.element.setAttribute(":widget", options.tagName);
				}
			}
			*/
		} else {
			if(options[Const.ARG_TYPE_NAMESPACE]) {
				context.element = context.content = document.createElementNS(options[Const.ARG_TYPE_NAMESPACE], options.tagName);
			} else {
				context.element = context.content = document.createElement(options.tagName);
			}
			/* debug:
			if(context.element.setAttribute) {
				context.element.setAttribute(":created", "");
			}
			*/
		}
	}

	args.sort(function(a, b){
		return a[1] - b[1];
	});
	
	args.forEach(function(arg){
		context.element.__builder[arg[1]](arg[2], arg[0], context.bind, context.anchor, context.scope);
	});

	if(options[Const.ARG_TYPE_TRANSITIONS]) {
		options[Const.ARG_TYPE_TRANSITIONS].forEach(function(transition){
			context.element.__builder.addAnimation(transition[0], transition[1], transition[2] || {});
		});
	}

	for(var widgetName in widgetExt) {
		if(!widgets.hasOwnProperty(widgetName)) throw new Error("Widget '" + widgetName + "' could not be found.");
		var widget = widgets[widgetName];
		var registry = new SlotRegistry(widgetName);
		var newContext = Polyfill.assign({}, context, {anchor: null, registry: registry});
		if(widget.prototype && widget.prototype.render) {
			var instance = new widgets[widgetName](widgetExt[widgetName]);
			instance.render(newContext);
			context.element.__builder.widgets[widgetName] = instance;
		} else {
			widget(newContext, widgetExt[widgetName]);
		}
		registry.applyTo(context.element, false);
		/* debug:
		if(context.element.setAttribute) {
			context.element.setAttribute(":extend:" + widgetName, "");
		}
		*/
	}

	widgetExtAnon.forEach(function(info){
		var newContext = Polyfill.assign({}, context, {anchor: null, registry: new SlotRegistry("")});
		if(info.widget.prototype && info.widget.prototype.render) {
			new info.widget(info.args).render(newContext);
		} else {
			info.widget(newContext, info.args);
		}
		/* debug:
		if(context.element.setAttribute) {
			context.element.setAttribute(":extend.anonymous:" + info.widget.name, "");
		}
		*/
	});

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
	context.parent = context.element;
	context.element = context.content = null; // delete parents
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
	context.element = context.content = context.element.cloneNode(true);
	context.anchor = null; // invalidate the current anchor so the children will not use it
	Sactory.update(context, options);
};

/**
 * @since 0.73.0
 */
Sactory.updateSlot = function(context, options, widgetName, slotName, fun){
	var element = context.slot || context.element;
	if(!widgetName) widgetName = "__main";
	var slots = element.__builder.slots[widgetName];
	if(!slots) throw new Error("Could not find widget '" + widgetName + "'.");
	var slot = slots[slotName];
	if(!slot) throw new Error("Could not find slot '" + slotName + "' for widget '" + widgetName + "'.");
	if(slot.element) {
		Sactory.update(Polyfill.assign({}, context, {element: slot.element}), options);
	}
	fun.call(context.scope, Polyfill.assign({}, context, {element: slot.anchor ? slot.anchor.parentNode : slot.element, anchor: slot.anchor}));
};

/**
 * @since 0.60.0
 */
Sactory.body = function(context, fun){
	fun.call(context.scope, Polyfill.assign({}, context, {slot: context.element, element: context.content || context.element}));
};

/**
 * @since 0.82.0
 */
Sactory.forms = function(context){
	Array.prototype.slice.call(arguments, 1).forEach(function(value){
		(context.input || context.content).__builder.form(value[0], value[1], value[2], context.bind);
	});
};

/**
 * @since 0.60.0
 */
Sactory.append = function(context, parent, afterappend, beforeremove){
	if(parent && parent.nodeType || typeof parent == "string" && (parent = document.querySelector(parent))) {
		if(context.parentAnchor && context.parentAnchor.parentNode === parent) parent.insertBefore(context.element, context.parentAnchor);
		else parent.appendChild(context.element);
		if(afterappend) afterappend.call(context.element);
		if(context.element.__builder && context.element.dispatchEvent) context.element.__builder.dispatchEvent("append"); //TODO only fire when listened for
		if(beforeremove) context.element.__builder.event(context.scope, "remove", beforeremove, context.bind);
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
Sactory.query = function(scope, context, doc, parent, selector, all, fun){
	var nodes = false;
	if(all || (nodes = selector && typeof selector == "object" && typeof selector.length == "number")) {
		if(!nodes) {
			selector = doc.querySelectorAll(selector);
		}
		Array.prototype.forEach.call(selector, function(element){
			fun.call(scope, Polyfill.assign({}, context, {element: element, parentElement: parent}));
		});
		return selector;
	} else {
		if(typeof selector == "string") {
			selector = doc.querySelector(selector);
		}
		if(selector) fun.call(scope, Polyfill.assign({}, context, {element: selector, parentElement: parent}));
		return selector;
	}
};

/**
 * @since 0.94.0
 */
Sactory.clear = function(context){
	var child;
	var element = context.content || context.element;
	while(child = element.lastChild) {
		element.removeChild(child);
	}
};

/**
 * @since 0.90.0
 */
Sactory.mixin = function(context, data){
	if(data instanceof Node) {
		Sactory.append({element: data, bind: context.bind, parentAnchor: context.anchor}, context.element);
	} else {
		Sactory.html(element, bind, anchor, data);
	}
};

/**
 * @since 0.78.0
 */
Sactory.text = function(context, text){
	if(context.element) {
		context.element.__builder.text(text, context.bind, context.anchor);
	}
};

/**
 * @since 0.78.0
 */
Sactory.html = function(context, html){
	if(context.element) {
		context.element.__builder.html(html, context.bind, context.anchor);
	}
};

/**
 * @since 0.40.0
 */
Sactory.comment = function(context, comment){
	var ret = document.createComment(comment);
	Sactory.append({element: ret, bind: context.bind, parentAnchor: context.anchor}, context.element);
	return ret;
};

/**
 * @since 0.78.0
 */
Sactory.on = function(scope, context, name, value){
	if(arguments.length == 5) {
		arguments[2].__builder.event(scope, arguments[3], arguments[4], context.bind);
	} else {
		context.element.__builder.event(scope, name, value, context.bind);
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
 * @since 0.98.0
 */
Sactory.forEach = function(scope, value, fun){
	if(value.forEach) {
		value.forEach(fun.bind(scope));
	} else {
		// assuming it's an object
		var index = 0;
		for(var key in value) {
			fun.call(scope, key, value[key], index++, value);
		}
	}
};

/**
 * @since 0.98.0
 */
Sactory.range = function(scope, from, to, fun){
	if(from < to) {
		for(var i=from; i<to; i++) {
			fun.call(scope, i);
		}
	} else {
		for(var i=to; i>from; i--) {
			fun.call(scope, i);
		}
	}
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
Object.defineProperty(Sactory, "isDebug", {
	value: true
});

var debugTitle;
var debugging = false;

var help = "Available commands:\n\
  bind: Show a map of the whole binding system.\n\
  help: Show this message.\n\
"

Object.defineProperty(Sactory, "debug", {
	get: function(){
		if(!debugging) {
			debugging = true;
			Object.defineProperty(window, "bind", {
				get: function(){
					function make(bind) {
						return {
							elements: bind.elements,
							subscriptions: bind.subscriptions,
							children: bind.children.map(make)
						};
					}
					return make(Sactory.bindFactory);
				}
			});
			Object.defineProperty(window, "help", {
				get: function(){
					console.log(help);
				}
			});
			debugTitle.textContent = box + help + "\n";
			console.log(help);
		}
	}
});

var box = "\n\n\
╭─╴ ╭─╮ ╭─╴ ─┬─ ╭─╮ ╭─╮ ╷ ╷ \n\
╰─╮ ├─┤ │    │  │ │ ├┬╯ ╰┬╯ \n\
╶─╯ ╵ ╵ ╰─╴  ╵  ╰─╯ ╵╰   ╵  \n\
";

if(typeof window == "object") {
	for(var i=26-Sactory.VERSION.length; i>0; i--) {
		box += " ";
	}
	box += "v" + Sactory.VERSION + "\n\n";
	Sactory.ready(function(){
		document.insertBefore(debugTitle = document.createComment(box + "Type Sactory.debug in the\nconsole to start debugging.\n\n"), document.documentElement);
	});
}
*/

module.exports = Sactory;
