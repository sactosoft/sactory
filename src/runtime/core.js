var Polyfill = require("../polyfill");

var Sactory = {};

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

/**
 */
Sactory.defineTemplate = function(name, tagName, args, handler){
	if(typeof tagName == "function" || Array.isArray(tagName)) {
		handler = args;
		args = tagName;
		tagName = null;
	}
	if(typeof args == "function") {
		handler = args;
		args = [];
	}
	var forced = tagName && tagName.charAt(0) == '!';
	definedTemplates[name] = {
		name: name,
		tagName: forced ? tagName.substr(1) : tagName,
		forced: forced,
		args: args || [],
		handler: handler
	};
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
 */
Sactory.createElement = function(bind, anchor, tagName, options){
	var a = Array.prototype.slice.call(arguments, 0);
	a.unshift(null);
	return Sactory.updateElement.apply(null, a);
};

/**
 * @since 0.29.0
 */
Sactory.updateElement = function(element, bind, anchor, tagName, options){
	
	var namespace;
	var elementArgs = {};
	var templateArgs = {};
	if(options.args) {
		options.args.forEach(function(arg){
			var remove = false;
			if(arg.key == "namespace") {
				namespace = arg.value;
			} else if(arg.key.charAt(0) == '$') {
				var key = arg.key.substr(1);
				if(key == "arguments") {
					Polyfill.assign(templateArgs, arg.value);
				} else {
					templateArgs[key] = arg.value;
				}
			} else {
				elementArgs[arg.key] = arg.value;
			}
		});
	}

	var templates = [];
	
	if(options.templates) {
		options.templates.forEach(function(templateName){
			var optional = templateName.charAt(0) == '?';
			if(optional) templateName = templateName.substr(1);
			var template = definedTemplates[templateName];
			if(template) {
				templates.push(template);
				if(!tagName) tagName = template.tagName;
				else if(template.forced && tagName) throw new Error("Template '" + templateName + "' forces the tag name but the tag name it's already set.");
			} else if(!optional) {
				throw new Error("Template '" + templateName + "' could not be found.")
			}
		});
	}

	if(arguments.length > 5) {
		Array.prototype.slice.call(arguments, 5).forEach(function(spread){
			Polyfill.assign(elementArgs, spread);
		});
	}
	
	if(!element) {
		if(options.namespace) {
			element = document.createElementNS(NAMESPACES[options.namespace] || options.namespace, tagName);
		} else {
			element = document.createElement(tagName);
		}
	}
	
	for(var key in elementArgs) {
		element.__builder.setImpl(key, elementArgs[key], bind, anchor);
	}
	
	var container = element;
	
	templates.forEach(function(template){
		// filter template-specific attributes
		var a = {};
		for(var key in templateArgs) {
			var value = templateArgs[key];
			var i = key.indexOf(':');
			if(i > 0) {
				if(key.substring(0, i) == template.name) a[key.substr(i + 1)] = value;
			} else {
				a[key] = value;
			}
		}
		container = template.handler.call(container, container, a) || container;
	});
	
	return {
		element: element,
		container: container
	};
	
};

/**
 * @since 0.36.0
 */
Sactory.callImpl = function(context, element, container, fun){
	fun.call(context, container);
	return element;
};

/**
 */
Sactory.call = function(context, element, fun){
	return Sactory.callImpl(context, element.element, element.container, fun);
};

/**
 * @since 0.36.0
 */
Sactory.callElement = function(context, element, fun){
	return Sactory.callImpl(context, element, element, fun);
};

/**
 * @since 0.32.0
 */
Sactory.unique = function(context, id, fun){
	var className = "__sactory" + id;
	if(!document.querySelector("." + className)) {
		var element = fun.call(context);
		element.classList.add(className);
		return element;
	}
};

/**
 * @since 0.17.0
 */
Sactory.append = function(element, bind, anchor, child, afterappend, beforeremove){
	if(element || typeof element == "string" && element.length && (element = document.querySelector(element))) {
		if(anchor && anchor.parentNode === element) element.insertBefore(child, anchor);
		else element.appendChild(child);
		if(afterappend) afterappend.call(child);
		if(beforeremove) child.__builder.beforeremove = beforeremove;
		if(bind) bind.appendChild(child);
	}
	return child;
};

/**
 * @since 0.36.0
 */
Sactory.appendElement = function(element, bind, anchor, child, afterappend, beforeremove){
	return Sactory.append(element, bind, anchor, child.element, afterappend, beforeremove);
};

/**
 * @since 0.40.0
 */
Sactory.comment = function(element, bind, anchor, comment){
	return Sactory.append(element, bind, anchor, document.createComment(comment));
};

/**
 * @since 0.32.0
 */
Sactory.query = function(context, doc, selector, fun){
	if(!fun) {
		fun = selector;
		selector = doc;
		doc = document;
	}
	var elements, ret;
	if(selector instanceof Element) {
		elements = [selector];
		ret = selector;
	} else if(selector instanceof NodeList) {
		elements = ret = selector;
	} else {
		elements = ret = doc.querySelectorAll(selector);
	}
	for(var i=0; i<elements.length; i++) {
		fun.call(context, elements[i]);
	}
	return ret;
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
