var Polyfill = require("../polyfill");
var Const = require("../const");
var { dehyphenate } = require("../util");
var SactoryConst = require("./const");
var SactoryContext = require("./context");
var SactoryMisc = require("./misc");
var SactoryWidget = require("./widget").Sactory;
var { Widget, Registry } = require("./widget");

var Sactory = {};

/**
 * @since 0.60.0
 */
function chain(context, ...functions) {
	var newContext = SactoryContext.newChainContext(context);
	functions.forEach(([fun, ...args]) => fun.call(null, newContext, ...args));
	return newContext.element;
}

/**
 * @since 0.128.0
 */
chain.all = function(context, [ffun, ...fargs], ...functions){
	var newContext = SactoryContext.newChainContext(context);
	newContext.all = true;
	ffun.call(null, newContext, ...fargs);
	Array.prototype.forEach.call(newContext.elements, element => {
		functions.forEach(([fun, ...args]) => fun.call(null, Polyfill.assign({}, newContext, {element}), ...args));
	});
	return newContext.elements;
};

/**
 * @since 0.80.0
 */
chain.nop = function(context){
	context.element = context.parentElement;
};

/**
 * @since 0.128.0
 */
chain.use = function(context, element){
	if(context.all) {
		context.elements = element;
	} else {
		context.element = element;
	}
};

/**
 * @since 0.128.0
 */
chain.query = function(context, selector, on){
	var element = on || context.parentElement || context.document || document;
	chain.use(context, element[context.all ? "querySelectorAll" : "querySelector"](selector));
};

/**
 * @since 0.128.0
 */
chain.slot = function(context, slotName, widgetName){
	var slot, registry = context.registry;
	do {
		var name = widgetName || registry.main;
		var slots = registry.slots[name];
		if(slots) slot = slots[slotName || SactoryConst.SL_CONTENT];
	} while(!slot && (registry = registry.parent));
	if(slot) {
		Polyfill.assign(context, slot);
	}
};

/**
 * @since 0.128.0
 */
chain.clone = function(context, element, deep = true){
	context.element = element.cloneNode(deep);
};

/**
 * @since 0.94.0
 */
chain.clear = function(context){
	var child, element = SactoryContext.currentElement(context);
	while(child = element.lastChild) {
		element.removeChild(child);
	}
};

/**
 * @since 0.14.0
 */
chain.namespace = function(context, namespace){
	context.namespace = namespace;
};

/**
 * @since 0.60.0
 */
chain.updateImpl = function(context, [attrs = [], iattrs, sattrs, widgetCheck, tagName, tagNameString]){

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
			if(type >= Const.BUILDER_TYPE_CREATE_WIDGET) {
				var obj;
				if(SactoryMisc.isBuilderObservable(value)) {
					value = value.use(context.bind);
				}
				if(type >= Const.BUILDER_TYPE_UPDATE_WIDGET) {
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
						var col = name.indexOf(":");
						if(col == -1) {
							widgetExt.push({
								name, 
								args: widgetExtRef[name] = value
							});
							return;
						} else {
							var key = name.substring(0, col);
							if(type == Const.BUILDER_TYPE_UPDATE_WIDGET) {
								widgetExt.push({
									name: key,
									args: obj = {}
								});
							} else if(!Object.prototype.hasOwnProperty.call(widgetExtRef, key)) {
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
				var splitted = name.split(".");
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
		var widget, ref = { name: tagNameString || tagName };
		if(widgetCheck !== false && (widget = SactoryWidget.getFunctionWidget(tagName, context.registry, ref))) {
			var slotRegistry = registry.sub(ref.name, true);
			var newContext = SactoryContext.newContext(context, {element: null, anchor: null, registry: slotRegistry});
			if(widget.prototype && widget.prototype.render) {
				var instance = Widget.newInstance(widget, newContext, widgetArgs);
				// register here so the widget can access its children when rendering
				registry.widgets.main = registry.widgets.named[ref.name] = instance;
				var element = Widget.render(widget, instance, newContext, widgetArgs);
				element["~builder"].widget = element["~builder"].widgets[ref.name] = instance;
				context.element = element;
			} else {
				context.element = widget.call(ref.parentWidget, widgetArgs, widgetArgs, newContext);
				if(!(context.element instanceof Node)) {
					throw new Error(`The widget did not return an instance of 'Node', returned '${context.element}' instead.`);
				}
			}
			if(slotRegistry.targetSlots[SactoryConst.SL_CONTENT]) {
				var content = slotRegistry.targetSlots[SactoryConst.SL_CONTENT];
				context.content = content.element || content.anchor.parentNode;
				context.anchor = content.anchor;
			} else {
				context.content = context.element;
			}
			updatedElement = context.element;
			if(slotRegistry.targetSlots[SactoryConst.SL_CONTAINER]) {
				updatedElement = context.container = slotRegistry.targetSlots[SactoryConst.SL_CONTAINER].element;
			}
			if(slotRegistry.targetSlots[SactoryConst.SL_INPUT]) {
				context.input = slotRegistry.targetSlots[SactoryConst.SL_INPUT].element;
			}
		} else {
			var update = element => updatedElement = context.element = context.content = element;
			if(context.namespace) {
				update(context.document.createElementNS(context.namespace, tagName));
			} else if(tagName == "svg") {
				update(context.document.createElementNS(context.namespace = "http://www.w3.org/2000/svg", tagName));
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
	args.forEach(({type, name, value}) => updatedElement["~builder"][type](context, name, value));

	widgetExt.forEach(({widget, name, args}) => {
		var ref = { name };
		if(!widget) {
			widget = SactoryWidget.getWidget(name, context.registry, ref);
			if(!widget) throw new Error("Widget '" + name + "' could not be found.");
		}
		var slotRegistry = registry.sub(ref.name || "", false);
		var newContext = SactoryContext.newContext(context, {anchor: null, registry: slotRegistry});
		if(widget.prototype && widget.prototype.render) {
			var {instance, element} = Widget.newInstanceRender(widget, newContext, args);
			if(element !== updatedElement) {
				throw new Error("The widget did not return the given element, hence does not support extension.");
			}
			if(ref.name) registry.widgets.named[ref.name] = updatedElement["~builder"].widgets[ref.name] = instance;
		} else if(ref.parentWidget) {
			widget.call(ref.parentWidget, args, args, newContext);
		} else {
			widget(args, args, newContext);
		}
	});

	// update context's widget registry
	context.registry = registry;

	/* debug:
	if(context.element.setAttribute) {
		context.element.setAttribute(":id", context.element["~builder"].runtimeId);
	}
	*/
	
};

/**
 * @since 0.128.0
 */
chain.update = function(context, options){
	if(!context.element) {
		// only update if not previously updated
		context.element = context.parentElement;
	}
	chain.updateImpl(context, options);
};

/**
 * @since 0.60.0
 */
chain.create = function(context, tagName, options, tagNameString){
	options[4] = tagName;
	options[5] = tagNameString;
	context.anchor = null; // invalidate the current anchor so the children will not use it
	context.created = true;
	chain.updateImpl(context, options);
};

/**
 * @since 0.128.0
 */
chain.createIf = function(context, tagName, options, tagNameString){
	if(context.parentElement) {
		chain.update(context, options);
	} else {
		chain.create(context, tagName, options, tagNameString);
	}
};

/**
 * @since 0.134.0
 */
chain.ref = function(context){
	Array.prototype.slice.call(arguments, 1).forEach(ref => ref(context.element));
};

/**
 * @since 0.134.0
 */
chain.refWidget = function(context){
	var widget = context.element["~builder"].widget;
	Array.prototype.slice.call(arguments, 1).forEach(ref => ref(widget));
};

/**
 * @since 0.128.0
 */
chain.slots = function(context, slots){
	slots.forEach(name => context.registry.add(null, name, context.element));
};

/**
 * @since 0.128.0
 */
chain.text = function(context, text){
	SactoryContext.currentElement(context)["~builder"].text(text, context);
};

/**
 * @since 0.128.0
 */
chain.html = function(context, html){
	SactoryContext.currentElement(context)["~builder"].html(html, context);
};

/**
 * @since 0.90.0
 */
chain.mixin = function(context, data){
	if(data instanceof Node) {
		chain.appendTo({
			element: data,
			top: context.top,
			bind: context.bind,
			parentAnchor: context.anchor
		}, SactoryContext.currentElement(context));
	} else if(data) {
		chain.html(context, data);
	}
};

/**
 * @since 0.60.0
 */
chain.body = function(context, fun){
	const element = context.content || context.element || context.parentElement;
	fun(SactoryContext.newContext(context, {
		slot: context.element,
		element, document: context.document || element.ownerDocument,
		top: context.top && !context.created
	}));
};

/**
 * @since 0.82.0
 */
chain.bind = function(context){
	var element = context.input || context.content;
	Array.prototype.slice.call(arguments, 1).forEach(([type, info, value, update]) => {
		// look for widget's custom binding in registry
		const widget = context.registry.widgets.main;
		if(widget) {
			const proto = Object.getPrototypeOf(widget);
			if(proto.bind$) {
				// all of them
				widget.bind$(type, {info, value, update}, context);
				return;
			} else {
				let fun = proto["bind$" + type] || proto["bind$" + dehyphenate(type)];
				if(fun) {
					// handling a specific type
					fun.call(widget, {info, value, update}, context);
					return;
				}
			}
		}
		// fallback to default element's bind handler
		element["~builder"].bind(context, type, info, value, update);
	});
};

/**
 * @since 0.60.0
 */
chain.appendTo = function(context, parentNode){
	if(context.top) {
		// the data is registered as a child of the bind context only if the `top` property is true,
		// this is because only the direct children should be removed from the parent when the bind is rolled back.
		// The property should guarantee that the `bind` property is an instance of `Bind`, thus valid.
		if(context.element instanceof DocumentFragment) {
			// special case for adopted fragments: add to the bind context its children instead of
			// the document fragment itself because the children are removed when the fragment is appended,
			// and removing the fragment from the DOM does not remove the children too.
			Array.prototype.forEach.call(context.element.childNodes, child => context.bind.appendChild(child));
		} else {
			context.bind.appendChild(context.element);
		}
	}
	if(context.parentAnchor && context.parentAnchor.parentNode === parentNode) {
		parentNode.insertBefore(context.element, context.parentAnchor);
	} else {
		parentNode.appendChild(context.element);
	}
	if(context.element["~builder"] && context.element["~builder"].events.append) {
		context.element["~builder"].dispatchEvent("append", {bubbles: false, detail: {parentNode}});
	}
};

/**
 * @since 0.128.0
 */
chain.append = function(context){
	if(context.parentElement) {
		chain.appendTo(context, context.parentElement);
	}
};

/**
 * @since 0.128.0
 */
chain.appendToIf = function(context, parent){
	if(context.created) {
		chain.appendTo(context, parent);
	}
};

/**
 * @since 0.128.0
 */
chain.appendIf = function(context, options){
	if(context.created) {
		chain.append(context, options);
	}
};

Sactory.chain = chain;

module.exports = Sactory;
