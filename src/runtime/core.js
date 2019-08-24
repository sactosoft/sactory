var Polyfill = require("../polyfill");
var Const = require("../const");
var { hyphenate } = require("../util");
var SactoryConfig = require("./config");
var SactoryContext = require("./context");
var { Widget, Registry } = require("./widget");

Object.defineProperty(Node, "ANCHOR_NODE", {
	writable: false,
	enumerable: true,
	configurable: false,
	value: 99
});

/**
 * @since 0.60.0
 */
function Sactory(scope, context1, context2, ...functions) {
	var context = SactoryContext.newChainContext(scope, context1, context2);
	functions.forEach(([fun, ...args]) => fun.call(null, context, ...args));
	return context.element;
}

/**
 * @since 0.128.0
 */
Sactory.all = function(scope, context1, context2, [ffun, ...fargs], ...functions){
	var context = SactoryContext.newChainContext(scope, context1, context2);
	context.all = true;
	ffun.call(null, context, ...fargs);
	Array.prototype.forEach.call(context.elements, element => {
		functions.forEach(([fun, ...args]) => fun.call(null, Polyfill.assign({}, context, {element}), ...args));
	});
	return context.elements;
};

// constants

Sactory.Const = Const;

Sactory.NS_XHTML = "http://www.w3.org/1999/xhtml";
Sactory.NS_SVG = "http://www.w3.org/2000/svg";
Sactory.NS_MATHML = "http://www.w3.org/1998/mathml";
Sactory.NS_XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
Sactory.NS_XBL = "http://www.mozilla.org/xbl";

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
 * @since 0.80.0
 */
Sactory.nop = function(context){
	context.element = context.parentElement;
};

/**
 * @since 0.128.0
 */
Sactory.use = function(context, element){
	if(context.all) {
		context.elements = element;
	} else {
		context.element = element;
	}
};

/**
 * @since 0.128.0
 */
Sactory.query = function(context, selector, on){
	Sactory.use(context, (on || context.parentElement || context.document || document)[context.all ? "querySelectorAll" : "querySelector"](selector));
};

/**
 * @since 0.128.0
 */
Sactory.slot = function(context, slotName, widgetName){
	var slot, registry = context.registry;
	do {
		var name = widgetName || registry.main;
		var slots = registry.slots[name];
		if(slots) slot = slots[slotName || Sactory.SL_CONTENT];
	} while(!slot && (registry = registry.parent));
	if(slot) {
		Polyfill.assign(context, slot);
	}
};

/**
 * @since 0.128.0
 */
Sactory.clone = function(context, element, deep = true){
	context.element = element.cloneNode(deep);
};

/**
 * @since 0.94.0
 */
Sactory.clear = function(context){
	var child, element = SactoryContext.currentElement(context);
	while(child = element.lastChild) {
		element.removeChild(child);
	}
};

/**
 * @since 0.60.0
 */
Sactory.updateImpl = function(context, [attrs = [], iattrs, sattrs, transitions, visibility, widgetCheck, namespace, tagName, tagNameString]){

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
	var widgetExt = [];
	var widgetExtRef = {};

	// filter out optional arguments
	attrs.forEach(([type, name, value, optional]) => {
		if(!optional || value !== undefined) {
			var ext = type == Const.BUILDER_TYPE_EXTEND_WIDGET;
			if(ext || type == Const.BUILDER_TYPE_WIDGET) {
				var obj;
				if(ext) {
					if(typeof name[0] == "function") {
						var widget = name[0];
						name = name.slice(1).toString().substr(1); // assuming the first character is a column
						if(name.length) {
							widgetExt.push({
								widget,
								args: obj = {}
							});
						} else {
							widgetExt.push({
								widget,
								args: value
							});
							return;
						}
					} else {
						name = name.toString();
						var col = name.indexOf(':');
						if(col == -1) {
							widgetExt.push({
								name, 
								args: widgetExtRef[name] = value
							});
							return;
						} else {
							var key = name.substring(0, col);
							if(!Object.prototype.hasOwnProperty.call(widgetExtRef, key)) {
								widgetExt.push({
									name: key,
									args: obj = widgetExtRef[key] = {}
								});
							} else {
								obj = widgetExtRef[key];
							}
							name = name.substr(col + 1);
						}
					}
				} else {
					name = name.toString();
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

	// create new context's widget registry
	var registry = new Registry(context.registry);
	
	if(!updatedElement) {
		var parentWidget, widget;
		function getWidget() {
			var columns = tagName.indexOf("::");
			if(columns == -1) {
				return widgets[tagName];
			} else {
				var parentName = tagName.substring(0, columns);
				if(parentName == "this") {
					parentWidget = context.scope;
				} else if(context.widgets) {
					var search = context.registry;
					if(parentName) {
						// search in named widgets
						do {
							parentWidget = search.widgets.named[parentName];
						} while(!parentWidget && (search = search.parent));
					} else {
						// search in main widgets
						do {
							parentWidget = search.widgets.main;
						} while(!parentWidget && (search = search.parent));
					}
				}
				return parentWidget && parentWidget[":" + tagName.substr(columns + 2)]
			}
		}
		if((widgetCheck === undefined || widgetCheck) && ((widget = typeof tagName == "function" && tagName) || (widget = getWidget()))) {
			var widgetName = tagNameString || tagName;
			var slotRegistry = registry.sub(widgetName, true);
			var newContext = SactoryContext.newContext(context, {element: null, anchor: null, registry: slotRegistry});
			if(widget.prototype && widget.prototype.render) {
				var {instance, element} = Widget.createClassWidget(widget, newContext, widgetArgs);
				registry.widgets.main = registry.widgets.named[widgetName] = element.__builder.widget = element.__builder.widgets[widgetName] = instance;
				context.element = element;
			} else {
				context.element = widget.call(parentWidget, widgetArgs, newContext);
				if(!(context.element instanceof Node)) throw new Error("The widget did not return an instance of 'Node', returned '" + context.element + "' instead.");
			}
			if(slotRegistry.targetSlots[Sactory.SL_CONTENT]) {
				var content = slotRegistry.targetSlots[Sactory.SL_CONTENT];
				context.content = content.element || content.anchor.parentNode;
				context.anchor = content.anchor;
			} else {
				context.content = context.element;
			}
			updatedElement = context.element;
			if(slotRegistry.targetSlots[Sactory.SL_CONTAINER]) updatedElement = context.container = slotRegistry.targetSlots[Sactory.SL_CONTAINER].element;
			if(slotRegistry.targetSlots[Sactory.SL_INPUT]) context.input = slotRegistry.targetSlots[Sactory.SL_INPUT].element;
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
			var update = element => updatedElement = context.element = context.content = element;
			if(namespace) {
				update(context.document.createElementNS(namespace, tagName));
			} else {
				update(context.document.createElement(tagName));
			}
			/* debug:
			if(context.element.setAttribute) {
				context.element.setAttribute(":created", "");
			}
			*/
		}
	}

	// create priority for attributes based on type
	args.sort((a, b) => a.type - b.type);
	
	// apply attributes to builder
	args.forEach(({type, name, value}) => updatedElement.__builder[type](context, name, value));

	if(transitions) {
		transitions.forEach(([type, name, options]) => updatedElement.__builder.addAnimation(type, name, options || {}));
	}

	if(visibility) {
		var [value, visible] = visibility;
		updatedElement.__builder.visibility(context, value, visible);
	}

	widgetExt.forEach(({widget, name, args}) => {
		if(name) {
			if(!Object.prototype.hasOwnProperty.call(widgets, name)) throw new Error("Widget '" + name + "' could not be found.");
			widget = widgets[name];
		}
		var slotRegistry = registry.sub(name || "", false);
		var newContext = SactoryContext.newContext(context, {anchor: null, registry: slotRegistry});
		if(widget.prototype && widget.prototype.render) {
			var {instance, element} = Widget.createClassWidget(widget, newContext, args);
			if(element !== updatedElement) throw new Error("The widget did not return the given element, hence does not support extension.");
			if(name) registry.widgets.named[name] = updatedElement.__builder.widgets[name] = instance;
		} else {
			widget(args, newContext);
		}
		/* debug:
		if(context.element.setAttribute) {
			context.element.setAttribute(":extend:" + (name || "anonymous"), !name && widget.name || "");
		}
		*/
	});

	// update context's widget registry
	context.registry = registry;

	/* debug:
	if(context.element.setAttribute) {
		context.element.setAttribute(":id", context.element.__builder.runtimeId);
	}
	*/
	
};

/**
 * @since 0.128.0
 */
Sactory.update = function(context, options){
	if(!context.element) {
		// only update if not previously updated
		context.element = context.parentElement;
	}
	Sactory.updateImpl(context, options);
};

/**
 * @since 0.60.0
 */
Sactory.create = function(context, tagName, options, tagNameString){
	options[7] = tagName;
	options[8] = tagNameString;
	context.anchor = null; // invalidate the current anchor so the children will not use it
	context.created = true;
	Sactory.updateImpl(context, options);
};

/**
 * @since 0.128.0
 */
Sactory.createIf = function(context, tagName, options, tagNameString){
	if(context.parentElement) {
		Sactory.update(context, options);
	} else {
		Sactory.create(context, tagName, options, tagNameString)
	}
};

/**
 * @since 0.128.0
 */
Sactory.text = function(context, text){
	SactoryContext.currentElement(context).__builder.text(text, context.bind, context.anchor);
};

/**
 * @since 0.128.0
 */
Sactory.html = function(context, html){
	SactoryContext.currentElement(context).__builder.html(html, context.bind, context.anchor);
};

/**
 * @since 0.90.0
 */
Sactory.mixin = function(context, data){
	if(data instanceof Node) {
		Sactory.appendTo({element: data, bind: context.bind, parentAnchor: context.anchor}, SactoryContext.currentElement(context), {adoption: true});
	} else if(data) {
		Sactory.html(context, data);
	}
};

/**
 * @since 0.60.0
 */
Sactory.body = function(context, fun){
	fun.call(context.scope, SactoryContext.newContext(context, {slot: context.element, element: context.content || context.element || context.parentElement}));
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
Sactory.appendTo = function(context, parent, options = {}){
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
};

/**
 * @since 0.128.0
 */
Sactory.append = function(context, options){
	if(context.parentElement) {
		Sactory.appendTo(context, context.parentElement, options);
	}
};

/**
 * @since 0.128.0
 */
Sactory.appendToIf = function(context, parent, options){
	if(context.created) {
		Sactory.appendTo(context, parent, options);
	}
};

/**
 * @since 0.128.0
 */
Sactory.appendIf = function(context, options){
	if(context.created) {
		Sactory.append(context, options);
	}
};

/**
 * @since 0.32.0
 */
Sactory.unique = function(scope, {element}, id, fun){
	var className = SactoryConfig.config.prefix + id;
	if(!(element && element.ownerDocument || document).querySelector("." + className)) {
		var ret = fun.call(scope);
		ret.__builder.addClass(className);
		return ret;
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
 * @since 0.78.0
 */
Sactory.on = function(scope, context, name, value){
	if(arguments.length == 5) {
		arguments[2].__builder.event(scope, arguments[3], arguments[4], context.bind);
	} else {
		context.element.__builder.event(scope, name, value, context.bind);
	}
};

function Attr(args) {
	this.args = args;
	this.length = args.length;
	for(var i in args) {
		this[i] = args[i];
	}
}

Attr.prototype.get = function(index){
	return this.args[index];
};

Attr.prototype.slice = function(){
	return new Attr(Array.prototype.slice.apply(this.args, arguments));
};

Attr.prototype.split = function(separator){
	var ret = [];
	var curr;
	var push = value => {
		if(!curr) ret.push(curr = []);
		curr.push(value);
	};
	this.args.forEach(arg => {
		if(typeof arg == "function") {
			push(arg);
		} else {
			var splitted = (arg + "").split(separator);
			if(splitted.length) {
				if(!splitted[0].length) {
					curr = null;
					splitted.shift();
				}
				var last = splitted.pop();
				splitted.forEach(value => {
					push(value);
					curr = null;
				});
				if(last.length) push(last);
			}
		}
	});
	return ret.map(a => new Attr(a));
};

Attr.prototype.toValue = function(){
	return this.args.length == 1 ? this.args[0] : this.toString();
};

Attr.prototype.toString = function(){
	return this.args.join("");
};

/**
 * @since 0.127.0
 */
Sactory.attr = function(...args){
	return new Attr(args);
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
