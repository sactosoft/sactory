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
function Sactory(scope, {counter, bind, anchor, registry}, element, ...functions) {
	var context = {
		scope, element,
		counter, bind, anchor, registry,
		content: element,
		parentAnchor: anchor
	};
	functions.forEach(([fun, ...args]) => fun.call(null, context, ...args));
	return context.element;
}

/**
 * @since 0.122.0
 */
Sactory.init = function(count){
	return {counter: new SactoryConfig.Counter(count)};
};

// constants

Sactory.Const = Const;

Sactory.NS_XHTML = "http://www.w3.org/1999/xhtml";
Sactory.NS_SVG = "http://www.w3.org/2000/svg";
Sactory.NS_MATHML = "http://www.w3.org/1998/mathml";
Sactory.NS_XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
Sactory.NS_XBL = "http://www.mozilla.org/xbl";

Sactory.SL_CONTAINER = "__container";
Sactory.SL_CONTENT = "__content";
Sactory.SL_INPUT = "__input";

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
	return Object.prototype.hasOwnProperty.call(widgets, name);
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
	return element.__builderInstance && (name ? element.__builder.widgets[name] : element.__builder.widget) || null;
};

/**
 * Gets the widget with the given name associated to the
 * element queries with the given selector.
 * If no name is given the main widget is returned.
 * @since 0.115.0
 */
Sactory.widgetSelector = function(selector, name){
	var element = document.querySelector(selector);
	return element && Sactory.widget(element, name);
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
Sactory.Widget.prototype.dispatchEvent = function(event, options = {}){
	if(!this.element) throw new Error("Cannot dispatch event: the widget has not been rendered yet.");
	this.element.__builder.dispatchEvent(event, options);
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
	names.forEach(name => this.add(anchor, name, element));
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
Sactory.nop = function(){};

/**
 * @since 0.60.0
 */
Sactory.update = function(context, [attrs = [], iattrs, sattrs, transitions, visibility, widgetCheck, namespace, tagName]){

	if(iattrs) {
		iattrs.forEach(([type, before, names, after, value]) => {
			names.forEach(name => attrs.push([type, before + name + after, value]));
		});
	}

	if(sattrs) {
		sattrs.forEach(([type, values]) => {
			for(var key in values) {
				attrs.push([type, key, values[key]]);
			}
		});
	}
	
	var args = [];
	var widgetArgs = {};
	var widgetExt = {};
	var widgetExtAnon = [];

	// filter out optional arguments
	attrs.forEach(([type, name, value, optional]) => {
		if(!optional || value !== undefined) {
			var ext = type == Const.BUILDER_TYPE_EXTEND_WIDGET;
			if(ext || type == Const.BUILDER_TYPE_WIDGET) {
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
							if(!Object.prototype.hasOwnProperty.call(widgetExt, key)) obj = widgetExt[key] = {};
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
				args.push({type, name, value});
			}
		}
	});

	var updatedElement = context.container || context.element;
	
	if(!updatedElement) {
		var parentWidget, widget;
		function getWidget() {
			if(Polyfill.startsWith.call(tagName, "::")) {
				if(context.parent) {
					parentWidget = context.parent.__builder.widget;
					return parentWidget && parentWidget[tagName.substr(1)];
				}
			} else {
				var column = tagName.lastIndexOf(':');
				if(column == -1) {
					return widgets[tagName];
				} else {
					var name = tagName.substring(0, column);
					if(name == "this") {
						parentWidget = context.scope;
					} else if(context.parent) {
						parentWidget = context.parent.__builder.widgets[name];
					}
					return parentWidget && parentWidget[':' + tagName.substr(column + 1)];
				}
			}
		}
		if((widgetCheck === undefined || widgetCheck) && ((widget = typeof tagName == "function" && tagName) || (widget = getWidget()))) {
			var registry = new SlotRegistry(tagName);
			var newContext = Polyfill.assign({}, context, {element: null, anchor: null, registry});
			if(widget.prototype && widget.prototype.render) {
				var instance = new widget(widgetArgs, namespace);
				var ret = context.element = instance.__element = instance.render(newContext);
				if(instance instanceof Sactory.Widget) instance.element = instance.__element;
				if(!(ret instanceof Node)) throw new Error("The widget's render function did not return an instance of 'Node', returned '" + ret + "' instead.");
				context.element.__builder.widget = context.element.__builder.widgets[tagName] = instance;
			} else {
				context.element = widget.call(parentWidget, newContext, widgetArgs, namespace);
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
			updatedElement = context.element;
			if(registry.slots[Sactory.SL_CONTAINER]) updatedElement = context.container = registry.slots[Sactory.SL_CONTAINER].element;
			if(registry.slots[Sactory.SL_INPUT]) context.input = registry.slots[Sactory.SL_INPUT].element;
			/* debug:
			if(context.element.setAttribute) {
				if(typeof tagName == "function") {
					context.element.setAttribute(":widget.anonymous", tagName.name);
				} else {
					context.element.setAttribute(":widget", tagName);
				}
			}
			*/
		} else {
			if(namespace) {
				updatedElement = context.element = context.content = document.createElementNS(namespace, tagName);
			} else {
				updatedElement = context.element = context.content = document.createElement(tagName);
			}
			/* debug:
			if(context.element.setAttribute) {
				context.element.setAttribute(":created", "");
			}
			*/
		}
	}

	args.sort((a, b) => a.type - b.type);
	
	args.forEach(({type, name, value}) => updatedElement.__builder[type](context, name, value));

	if(transitions) {
		transitions.forEach(([type, name, options]) => updatedElement.__builder.addAnimation(type, name, options || {}));
	}

	if(visibility) {
		var [value, visible] = visibility;
		updatedElement.__builder.visibility(context, value, visible);
	}

	for(var widgetName in widgetExt) {
		if(!Object.prototype.hasOwnProperty.call(widgets, widgetName)) throw new Error("Widget '" + widgetName + "' could not be found.");
		var widget = widgets[widgetName];
		var registry = new SlotRegistry(widgetName);
		var newContext = Polyfill.assign({}, context, {anchor: null, registry});
		if(widget.prototype && widget.prototype.render) {
			var instance = new widgets[widgetName](widgetExt[widgetName]);
			instance.render(newContext);
			updatedElement.__builder.widgets[widgetName] = instance;
		} else {
			widget(newContext, widgetExt[widgetName]);
		}
		registry.applyTo(updatedElement, false);
		/* debug:
		if(context.element.setAttribute) {
			context.element.setAttribute(":extend:" + widgetName, "");
		}
		*/
	}

	widgetExtAnon.forEach(({widget, args}) => {
		var newContext = Polyfill.assign({}, context, {anchor: null, registry: new SlotRegistry("")});
		if(widget.prototype && widget.prototype.render) {
			new widget(args).render(newContext);
		} else {
			widget(newContext, args);
		}
		/* debug:
		if(context.element.setAttribute) {
			context.element.setAttribute(":extend.anonymous:" + widget.name, "");
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
	options[7] = tagName;
	context.parent = context.container || context.element;
	context.element = context.container = context.content = null; // delete parents
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
	context.element = context.container = context.content = context.element.cloneNode(true);
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
Sactory.forms = function(context, ...values){
	var input = context.input || context.content;
	values.forEach(([info, value, update]) => input.__builder.form(context, info, value, update));
};

/**
 * @since 0.60.0
 */
Sactory.append = function(context, parent, options = {}){
	if(parent && parent.nodeType || typeof parent == "string" && (parent = document.querySelector(parent))) {
		if(context.bind) {
			if(options.adoption && context.element instanceof DocumentFragment) {
				// special case for adopted fragments: add to the bind context its children instead of
				// the document fragment itself because the children are removed when the fragment is appended,
				// and removing the fragment from the DOM does not remove the children too.
				Array.prototype.forEach.call(context.element.childNodes, function(child){
					context.bind.appendChild(child);
				});
			} else {
				context.bind.appendChild(context.element);
			}
		}
		if(context.parentAnchor && context.parentAnchor.parentNode === parent) parent.insertBefore(context.element, context.parentAnchor);
		else parent.appendChild(context.element);
		if(options.aa) options.aa.call(context.element);
		if(context.element.__builderInstance && context.element.__builder.events.append) context.element.__builder.dispatchEvent("append", {bubbles: false});
		if(options.br) context.element.__builder.event(context.scope, "remove", options.br, context.bind);
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
	var child, element = context.content || context.element;
	while(child = element.lastChild) {
		element.removeChild(child);
	}
};

/**
 * @since 0.120.0
 */
Sactory.inherit = function(target, ...args){
	// the last two options (widget and namespace) are assigned only if
	// the target does not have them and the inheritance does
	for(var i=4; i<=6; i++) {
		if(target[i] === undefined) {
			args.forEach(arg => {
				var value = arg[i];
				if(value !== undefined) target[i] = value;
			});
		}
	}
	// the first four options are arrays and are merged in reverse so
	// the more the inherit tag was the less important is
	args.reverse().forEach(options => {
		for(var i=0; i<Math.min(4, options.length); i++) {
			var option = options[i];
			if(option) {
				if(target[i]) target[i].unshift(...option);
				else target[i] = option;
			}
		}
	});
	return target;
}

/**
 * @since 0.90.0
 */
Sactory.mixin = function(context, data){
	if(data instanceof Node) {
		Sactory.append({element: data, bind: context.bind, parentAnchor: context.anchor}, context.element, {adoption: true});
	} else if(data) {
		Sactory.html(context, data);
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
Sactory.nextId = function({counter}){
	return currentId = counter.nextPrefix();
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
		for(var i=from; i>to; i--) {
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
