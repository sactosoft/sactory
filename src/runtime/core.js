var Polyfill = require("../polyfill");
var Pipe = require("./pipe");

/**
 * @since 0.60.0
 */
function Sactory(context) {
	return new Pipe(context);
}

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

// constants

var NAMESPACES = {
	"xhtml": "http://www.w3.org/1999/xhtml",
	"svg": "http://www.w3.org/2000/svg",
	"mathml": "http://www.w3.org/1998/mathml",
	"xul": "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
	"xbl": "http://www.mozilla.org/xbl"
};

// templates

var definedTemplates = {};
var definedComponents = {};

/**
 * Defines or replaces a template.
 * @param {string} name - The case-sensitive name of the template.
 * @param {function} handler - The modifier called when a template is used.
 */
Sactory.defineTemplate = function(name, context, handler){
	definedTemplates[name] = {
		context: context,
		handler: handler
	};
};

/**
 * @since 0.58.0
 */
Sactory.undefineTemplate = function(name){
	delete definedTemplates[name];
};

/**
 * @since 0.59.0
 */
Sactory.getTemplatesName = function(){
	return Object.keys(definedTemplates);
};

/**
 * @since 0.58.0
 */
Sactory.defineComponent = function(name, handler){
	definedComponents[name] = {
		name: name,
		handler: handler
	};
};

/**
 * @since 0.58.0
 */
Sactory.undefineComponent = function(name){
	delete definedComponents[name];
};

/**
 * @since 0.59.0
 */
Sactory.getComponentsName = function(){
	return Object.keys(definedComponents);
};

/**
 * @class
 * @since 0.60.0
 */
Sactory.Component = function(){};

/**
 * @since 0.60.0
 */
Sactory.Component.prototype.render = function(args){
	throw new Error("'render' function not implemented.");
};

/**
 * @class
 * @since 0.60.0
 */
function AnchorRegistry(name) {
	this.name = name;
	this.anchors = {};
}

/**
 * @since 0.60.0
 */
AnchorRegistry.prototype.add = function(anchor, name, element){
	this.anchors[name || "__container"] = {element: element, anchor: anchor};
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
 * @since 0.60.0
 */
Sactory.create = function(result, bind, anchor, tagName, options){
	options.tagName = tagName;
	return Sactory.update(result, null, bind, anchor, options);
};

/**
 * @since 0.60.0
 */
Sactory.update = function(result, element, bind, anchor, options){
	
	var args = [];
	var elementArgs = {};
	var templateArgs = {};
	if(options.args) {
		options.args.forEach(function(arg){
			var remove = false;
			if(arg.key.charAt(0) == '$') {
				var key = arg.key.substr(1);
				var index = key.lastIndexOf(':');
				if(index == -1) {
					templateArgs[key] = Object(arg.value);
				} else {
					var name = key.substring(0, index);
					if(!templateArgs.hasOwnProperty(name)) templateArgs[name] = {};
					templateArgs[name][key.substr(index + 1)] = arg.value;
				}
			} else {
				args.push(arg);
				elementArgs[arg.key] = arg.value;
			}
		});
	}

	if(options.spread) {
		options.spread.forEach(function(spread){
			Polyfill.assign(elementArgs, spread);
		});
	}

	var container, anchors;
	
	if(!element) {
		var component = definedComponents[options.tagName];
		if(component) {
			var attributes = {};
			for(var key in elementArgs) {
				if(!/[@*+-]/.test(key.charAt(0))) {
					attributes[key] = elementArgs[key];
					delete elementArgs[key];
				}
			}
			anchors = new AnchorRegistry(component.name);
			component = component.handler(anchors, null, bind, null);
			element = component.render(attributes, options.namespace);
			element.__component = element["@@"] = component;
			if(anchors.anchors.__container) {
				container = anchors.anchors.__container.element;
				result.anchor = anchors.anchors.__container.anchor;
			}
		} else if(options.namespace) {
			element = document.createElementNS(NAMESPACES[options.namespace] || options.namespace, options.tagName);
		} else {
			element = document.createElement(options.tagName);
		}
	}

	if(!container) container = element;
	
	args.forEach(function(arg){
		element.__builder.setImpl(arg.key, arg.value, bind, anchor);
	});

	/*for(var key in elementArgs) {
		element.__builder.setImpl(key, elementArgs[key], bind, anchor);
	}*/
	
	for(var templateName in templateArgs) {
		var template = definedTemplates[templateName];
		if(!template) throw new Error("Could not find template '" + templateName + "'.");
		else template.handler.call(template.context, container, bind, null, templateArgs[templateName]);
	}
	
	Polyfill.assign(result, {
		element: element,
		container: container,
		anchors: anchors
	});

	return element;
	
};

/**
 * @since 0.60.0
 */
Sactory.updateAnchor = function(result, bind, anchor, options, anchors, component, anchorName, fun){
	var componentAnchor = (function(){
		if(anchors) {
			for(var i=anchors.length-1; i>=0; i--) {
				if(anchors[i].name == component) {
					for(var name in anchors[i].anchors) {
						if(name == anchorName) return anchors[i].anchors[name];
					}
				}
			}
		}
	})();
	if(!componentAnchor) throw new Error("Could not find anchor '" + anchorName + "' for component '" + component + "'.");
	var element = componentAnchor.element && Sactory.update(result, componentAnchor.element, bind, anchor, options);
	fun.call(this, element || componentAnchor.anchor.parentNode, componentAnchor.anchor);
	return element;
};

/**
 * @since 0.60.0
 */
Sactory.call = function(result, anchors, fun){
	if(result.anchors && Object.keys(result.anchors.anchors).length) {
		anchors = (anchors || []).concat(result.anchors);
	}
	var element = result.container || result.element;
	fun.call(this, result.anchor ? result.anchor.parentNode : element, result.anchor, anchors);
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
		if(beforeremove) result.element.__builder.beforeremove = beforeremove;
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
	var className = "__sa" + id;
	if(!document.querySelector("." + className)) {
		var element = fun.call(context);
		element.__builder.addClass(className);
		return element;
	}
};

/**
 * @since 0.32.0
 */
Sactory.query = function(context, doc, selector, all, fun){
	if(!fun) {
		fun = all;
		all = selector;
		selector = doc;
		doc = document;
	}
	var nodes = false;
	if(all || (nodes = selector instanceof NodeList)) {
		if(!nodes) {
			selector = doc.querySelectorAll(selector);
		}
		Array.prototype.forEach.call(selector, function(element){
			fun.call(context, element);
		});
		return selector;
	} else {
		if(!(selector instanceof Element)) {
			selector = doc.querySelector(selector);
		}
		if(selector) fun.call(context, selector);
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

Sactory.functions = {};

var currentId;

/**
 * @since 0.61.0
 */
Sactory.functions.nextId = function(){
	return currentId = "__sa" + Math.floor(Math.random() * 100000);
};

/**
 * @since 0.61.0
 */
Sactory.functions.currentId = function(){
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
