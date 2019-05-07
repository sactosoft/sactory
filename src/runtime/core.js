var Util = require("../util");

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
		tagName: forced && tagName.substr(1) || tagName,
		forced: forced,
		args: args || [],
		handler: handler
	};
};

// components

var definedComponents = {};

/**
 * @since 0.31.0
 */
Sactory.defineComponent = function(name, tagName, component){
	definedComponents[name] = {
		name: name,
		tagName: tagName,
		component: component
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
Sactory.createElement = function(str, args, spread){
	return Sactory.updateElement(null, str, args, spread);
};

/**
 * @since 0.29.0
 */
Sactory.updateElement = function(element, str, args, spread){
	
	var split = str.split('$');
	
	var tagName = split[0];
	var component;
	var templates = [];
	
	split.slice(1).forEach(function(templateName){
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

	if(spread) {
		for(var key in spread) {
			args.push({
				key: key,
				value: spread[key]
			});
		}
	}
	
	var namespace;
	var templateArgs = {};
	args.forEach(function(arg){
		var remove = false;
		if(arg.key == "namespace") {
			namespace = arg.value;
		} else if(arg.key.charAt(0) == '$') {
			var key = arg.key.substr(1);
			if(key == "arguments") {
				templateArgs = Object.assign(templateArgs, arg.value);
			} else {
				templateArgs[key] = arg.value;
			}
		} else {
			return;
		}
		arg.removed = true;
	});
	
	if(tagName && (component = definedComponents[tagName])) {
		tagName = component.tagName;
	}
	
	if(!element) {
		if(!tagName) throw new Error("No tag could be found in expression '" + str + "'.");
		if(namespace) {
			element = document.createElementNS(NAMESPACES[namespace] || namespace, tagName);
		} else {
			element = document.createElement(tagName);
		}
	}
	
	if(component) {
		element.__component = new component.component(element);
	}
	
	args.forEach(function(arg){
		if(!arg.removed) element.__builder.set(arg.key, arg.value);
	});
	
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
		if(bind) {
			bind.appendChild(child);
			bind.merge(child.__builder.bind);
			child.__builder.bind = bind;
		}
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

/**
 * @since 0.11.0
 */
Sactory.bind = function(type, context, element, bind, anchor, target, change, fun){
	var currentBind = (bind || Sactory.bindFactory).fork();
	var currentAnchor = null;
	var oldValue;
	function subscribe(subscriptions) {
		if(bind) bind.subscribe(subscriptions);
	}
	function record(value) {
		fun.call(context, element, currentBind, currentAnchor, oldValue = value);
	}
	function rollback(value) {
		currentBind.rollback();
		record(value);
	}
	if(element) {
		var start = document.createComment(" start " + type + " ");
		currentAnchor = document.createComment(" end " + type + " ");
		if(anchor) {
			element.insertBefore(start, anchor);
			element.insertBefore(currentAnchor, anchor);
		} else {
			element.appendChild(start);
			element.appendChild(currentAnchor);
		}
		if(bind) {
			bind.appendChild(start);
			bind.appendChild(currentAnchor);
		}
	}
	change = Sactory.unobserve(change);
	if(target.observe) target = target.observe;
	if(target.forEach) {
		target.forEach(function(ob){
			subscribe(ob.subscribe(rollback));
		});
		record();
	} else if(Sactory.isObservable(target)) {
		subscribe(target.subscribe(function(value){
			if(!change || change(oldValue, value)) {
				rollback(value);
			}
		}));
		if(Sactory.isOwnObservable(target)) {
			record(target.value);
		} else {
			record(target());
		}
	} else {
		throw new Error("Cannot bind to the given value: not an observable or an array of observables.");
	}
};

/**
 * @since 0.40.0
 */
Sactory.bindIf = function(type, context, element, bind, anchor, target, change, condition, fun){
	if(!target && Sactory.isContainerObservable(condition)) target = condition.observe;
	condition = Sactory.unobserve(condition);
	if(typeof condition != "function") throw new Error("The condition provided to :bind-if is not a function.");
	Sactory.bind(type, context, element, bind, anchor, target, change, function(element, bind, anchor, value){
		if(condition()) fun.call(this, element, bind, anchor, value);
	});
};

/**
 * @since 0.40.0
 */
Sactory.bindEach = function(type, context, element, bind, anchor, target, change, fun){
	Sactory.bind(type, context, element, bind, anchor, target, change, function(element, bind, anchor, value){
		value.forEach(function(currentValue, index, array){
			fun.call(context, element, bind, anchor, currentValue, index, array);
		});
	});
};

if(!Sactory.compilecssb) {
	Sactory.compilecssb = function(){
		throw new Error("CSSB runtime is not loaded. Either load it by using the full version of the runtime or use normal css by using the '#css' attribute.");
	};
}

module.exports = Sactory;
