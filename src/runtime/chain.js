var Polyfill = require("../polyfill");
var Const = require("../const");
var SactoryConst = require("./const");
var SactoryContext = require("./context");
var SactoryMisc = require("./misc");
var { widgets, Widget, Registry } = require("./widget");

var Sactory = {};

/**
 * @since 0.60.0
 */
function chain(context1, context2, ...functions) {
	var context = SactoryContext.newChainContext(context1, context2);
	functions.forEach(([fun, ...args]) => fun.call(null, context, ...args));
	return context.element;
}

/**
 * @since 0.128.0
 */
chain.all = function(context1, context2, [ffun, ...fargs], ...functions){
	var context = SactoryContext.newChainContext(context1, context2);
	context.all = true;
	ffun.call(null, context, ...fargs);
	Array.prototype.forEach.call(context.elements, element => {
		functions.forEach(([fun, ...args]) => fun.call(null, Polyfill.assign({}, context, {element}), ...args));
	});
	return context.elements;
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
	chain.use(context, (on || context.parentElement || context.document || document)[context.all ? "querySelectorAll" : "querySelector"](selector));
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
 * @since 0.60.0
 */
chain.updateImpl = function(context, [attrs = [], iattrs, sattrs, transitions, visibility, widgetCheck, namespace, tagName, tagNameString]){

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
				if(SactoryMisc.isBuilderObservable(value)) {
					value = value.use(context.bind);
				}
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
				if(context.registry) {
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
				var instance = Widget.newInstance(widget, newContext, widgetArgs);
				registry.widgets.main = registry.widgets.named[widgetName] = instance; // register here so the widget can access its children when rendering
				var element = Widget.render(widget, instance, newContext, widgetArgs);
				element["~builder"].widget = element["~builder"].widgets[widgetName] = instance;
				context.element = element;
			} else {
				context.element = widget.call(parentWidget, widgetArgs, newContext);
				if(!(context.element instanceof Node)) throw new Error("The widget did not return an instance of 'Node', returned '" + context.element + "' instead.");
			}
			if(slotRegistry.targetSlots[SactoryConst.SL_CONTENT]) {
				var content = slotRegistry.targetSlots[SactoryConst.SL_CONTENT];
				context.content = content.element || content.anchor.parentNode;
				context.anchor = content.anchor;
			} else {
				context.content = context.element;
			}
			updatedElement = context.element;
			if(slotRegistry.targetSlots[SactoryConst.SL_CONTAINER]) updatedElement = context.container = slotRegistry.targetSlots[SactoryConst.SL_CONTAINER].element;
			if(slotRegistry.targetSlots[SactoryConst.SL_INPUT]) context.input = slotRegistry.targetSlots[SactoryConst.SL_INPUT].element;
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
	args.forEach(({type, name, value}) => updatedElement["~builder"][type](context, name, value));

	if(transitions) {
		transitions.forEach(([type, name, options]) => updatedElement["~builder"].addAnimation(type, name, options || {}));
	}

	if(visibility) {
		var [value, visible] = visibility;
		updatedElement["~builder"].visibility(context, value, visible);
	}

	widgetExt.forEach(({widget, name, args}) => {
		if(name) {
			if(!Object.prototype.hasOwnProperty.call(widgets, name)) throw new Error("Widget '" + name + "' could not be found.");
			widget = widgets[name];
		}
		var slotRegistry = registry.sub(name || "", false);
		var newContext = SactoryContext.newContext(context, {anchor: null, registry: slotRegistry});
		if(widget.prototype && widget.prototype.render) {
			var {instance, element} = Widget.newInstanceRender(widget, newContext, args);
			if(element !== updatedElement) throw new Error("The widget did not return the given element, hence does not support extension.");
			if(name) registry.widgets.named[name] = updatedElement["~builder"].widgets[name] = instance;
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
	options[7] = tagName;
	options[8] = tagNameString;
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
		chain.create(context, tagName, options, tagNameString)
	}
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
	SactoryContext.currentElement(context)["~builder"].text(text, context.bind, context.anchor);
};

/**
 * @since 0.128.0
 */
chain.html = function(context, html){
	SactoryContext.currentElement(context)["~builder"].html(html, context.bind, context.anchor);
};

/**
 * @since 0.90.0
 */
chain.mixin = function(context, data){
	if(data instanceof Node) {
		chain.appendTo({element: data, bind: context.bind, parentAnchor: context.anchor}, SactoryContext.currentElement(context), {adoption: true});
	} else if(data) {
		chain.html(context, data);
	}
};

/**
 * @since 0.60.0
 */
chain.body = function(context, fun){
	fun(SactoryContext.newContext(context, {slot: context.element, element: context.content || context.element || context.parentElement}));
};

/**
 * @since 0.82.0
 */
chain.forms = function(context, ...values){
	var input = context.input || context.content;
	values.forEach(([info, value, update]) => input["~builder"].form(context, info, value, update));
};

/**
 * @since 0.60.0
 */
chain.appendTo = function(context, parent, options = {}){
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
	if(context.element["~builder"] && context.element["~builder"].events.append) context.element["~builder"].dispatchEvent("append", {bubbles: false});
	if(options.br) context.element["~builder"].event(context.scope, "remove", options.br, context.bind);
};

/**
 * @since 0.128.0
 */
chain.append = function(context, options){
	if(context.parentElement) {
		chain.appendTo(context, context.parentElement, options);
	}
};

/**
 * @since 0.128.0
 */
chain.appendToIf = function(context, parent, options){
	if(context.created) {
		chain.appendTo(context, parent, options);
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
