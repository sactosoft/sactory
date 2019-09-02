var { hyphenate, dehyphenate } = require("../util");
var SactoryConst = require("./const");
var SactoryContext = require("./context");
var counter = require("./counter");

var Sactory = {};

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
Sactory.getWidget = function(name, registry, ref = {}){
	var sep = name.indexOf("$");
	if(sep == -1) {
		return widgets[name];
	} else {
		var parentWidget, parentName = name.substring(0, sep);
		if(registry) {
			var search = registry;
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
		ref.parentWidget = parentWidget;
		ref.parentName = parentName;
		ref.name = name.substr(sep + 1);
		return parentWidget && (parentWidget["render$" + ref.name] || parentWidget["render$" + dehyphenate(ref.name)]);
	}
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
	return element["~builder"] && (name ? element["~builder"].widgets[name] : element["~builder"].widget) || null;
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
	error.style.fontFamily = "monospace";
	error.innerHTML = "The widget's <b>render</b> function is not implemented.";
	return error;
};

/**
 * @since 0.94.0
 */
Widget.prototype.dispatchEvent = function(event, options = {}){
	if(!this.element) throw new Error("Cannot dispatch event: the widget has not been rendered yet.");
	this.element["~builder"].dispatchEvent(event, options);
};

/**
 * @since 0.129.0
 */
Widget.newInstance = function(Class, context, args){
	return new Class(args, args, context);
};

/**
 * @since 0.125.0
 */
Widget.render = function(Class, instance, context, args){
	var element = instance.__element = instance.render(args, args, context);
	if(instance instanceof Widget) instance.element = element;
	if(!(element instanceof Node)) throw new Error("The widget's render function did not return an instance of 'Node', returned '" + element + "' instead.");
	if(Class.style) Widget.createStyle({document: context.document}, Class, element);
	if(Class.prototype.style) Widget.createStyle(context, instance, element);
	return element;
};

/*
 * @since 0.125.0
 */
Widget.createStyle = function(context, styler, element){
	var className = styler.__styled;
	if(!className) {
		styler.__styled = className = counter.nextPrefix();
		styler.style(SactoryContext.newContext(context, {selector: "." + className, element: context.document.head}));
	}
	element["~builder"].addClass(className);
};

/**
 * @since 0.129.0
 */
Widget.newInstanceRender = function(Class, args, context){
	var instance = Widget.newInstance(Class, context, args);
	return {instance, element: Widget.render(Class, instance, context, args)};
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
	this.slots = {};
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
	this.targetSlots[name || SactoryConst.SL_CONTENT] = {anchor, element};
};

// default widgets

Sactory.widgets = {
	fragment: (_0, _1, {document}) => document.createDocumentFragment(),
	shadow: ({mode = "open"}, _1, {parentElement}) => parentElement.attachShadow({mode})
};

module.exports = { Sactory, Widget, Registry };
