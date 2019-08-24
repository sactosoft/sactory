var Sactory = {};

Sactory.SL_CONTAINER = "__container";
Sactory.SL_CONTENT = "__content";
Sactory.SL_INPUT = "__input";

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
function Widget(attrs) {
	this.attrs = attrs;
}

Widget.prototype.element = null;

/**
 * @since 0.73.0
 */
Widget.prototype.render = function(){
	var error = document.createElement("p");
	error.style.color = "red";
	error.innerHTML = "The widget's <code>render</code> function is not implemented.";
	return error;
};

/**
 * @since 0.94.0
 */
Widget.prototype.dispatchEvent = function(event, options = {}){
	if(!this.element) throw new Error("Cannot dispatch event: the widget has not been rendered yet.");
	this.element.__builder.dispatchEvent(event, options);
};

/**
 * @since 0.125.0
 */
Widget.createClassWidget = function(Class, context, args, namespace){
	var instance = new Class(args, context);
	var element = instance.__element = instance.render(args, context);
	if(instance instanceof Widget) instance.element = element;
	if(!(element instanceof Node)) throw new Error("The widget's render function did not return an instance of 'Node', returned '" + element + "' instead.");
	if(Class.style) Widget.createStyle({priority: context.priority, counter: context.counter, document: context.document}, Class, element);
	if(Class.prototype.style) Widget.createStyle(context, instance, element);
	return {instance, element};
};

/*
 * @since 0.125.0
 */
Widget.createStyle = function(context, styler, element){
	var className = styler.__styled;
	if(!className) {
		styler.__styled = className = context.counter.nextPrefix();
		styler.style(Polyfill.assign({}, context, {selector: "." + className, element: context.document.head}));
	}
	element.__builder.addClass(className);
};

Sactory.Widget = Widget;

/**
 * @class
 * @param {Registry} parent
 * @since 0.128.0
 */
function Registry(parent) {
	this.parent = parent;
	this.widgets = {
		main: null,
		named: {}
	};
	this.slots = [];
	if(parent) this.targetSlots = parent.targetSlots;
	this.main = null;
}

Registry.prototype.sub = function(name, main){
	var ret = new Registry(this.parent);
	ret.widgets = this.widgets;
	ret.slots = this.slots;
	ret.targetSlots = this.slots[name] = {};
	if(main) this.main = name;
	return ret;
};

Registry.prototype.add = function(anchor, name, element){
	this.targetSlots[name || Sactory.SL_CONTENT] = {anchor, element};
};

Registry.prototype.addAll = function(anchor, names, element){
	names.forEach(name => this.add(anchor, name, element));
};

// default widgets

Sactory.widgets = {
	fragment: (_, {document}) => document.createDocumentFragment(),
	shadow: ({mode = "open"}, {parentElement}) => parentElement.attachShadow({mode})
};

module.exports = { Widget, Registry };
