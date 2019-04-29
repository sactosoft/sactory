var Factory = {};

var NAMESPACES = {
	"xhtml": "http://www.w3.org/1999/xhtml",
	"svg": "http://www.w3.org/2000/svg",
	"mathml": "http://www.w3.org/1998/mathml",
	"xul": "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
	"xbl": "http://www.mozilla.org/xbl"
};

// templates

var definedTemplates = {};

Factory.defineTemplate = function(name, tagName, args, handler){
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

Factory.defineComponent = function(name, tagName, component){
	definedComponents[name] = {
		name: name,
		tagName: tagName,
		component: component
	};
};

// init global functions used in interpretation

Factory.check = function(major, minor, patch){
	if(major != Factory.VERSION_MAJOR || minor != Factory.VERSION_MINOR) {
		throw new Error("Code transpiled using version " + major + "." + minor + "." + patch + " cannot be run in the current environment using version " + Factory.VERSION + ".");
	}
};

Factory.createElement = function(str, args){
	return Factory.updateElement(null, str, args);
};

Factory.updateElement = function(element, str, args){
	
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
			else if(template.forced && tagName) throw new Error("Template '" + templateName + "' forces the tag name but it's already defined.");
		} else if(!optional) {
			throw new Error("Template '" + templateName + "' could not be found.")
		}
	});
	
	var namespace;
	var templateArgs = {};
	args.forEach(function(arg){
		var remove = false;
		if(arg.key == "namespace") {
			namespace = arg.value;
		} else if(arg.key.charAt(0) == '$') {
			templateArgs[arg.key.substr(1)] = arg.value;
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

Factory.callImpl = function(context, element, container, fun){
	fun.call(context, container);
	return element;
};

Factory.call = function(context, element, fun){
	return Factory.callImpl(context, element.element, element.container, fun);
};

Factory.callElement = function(context, element, fun){
	return Factory.callImpl(context, element, element, fun);
};

Factory.unique = function(context, id, fun){
	var className = "__factory" + id;
	if(!document.querySelector("." + className)) {
		var element = fun.call(context);
		element.classList.add(className);
		return element;
	}
};

Factory.append = function(element, child, afterappend, beforeremove){
	if(element) {
		element.appendChild(child);
		if(afterappend) afterappend.call(child);
		child.__builder.beforeremove = beforeremove;
	}
	return child;
};

Factory.appendElement = function(element, child, afterappend, beforeremove){
	return Factory.append(element, child.element, afterappend, beforeremove);
};

Factory.query = function(context, doc, selector, fun){
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

Factory.bind = function(context, element, target, change, fun){
	var recordId = nextId();
	var oldValue;
	function record(value) {
		element.__builder.startRecording(recordId);
		fun.call(context, element, oldValue = value);
		element.__builder.stopRecording(recordId);
	}
	if(typeof target.forEach == "function") {
		target.forEach(function(ob){
			ob.subscribe(function(){
				element.__builder.rollback(recordId);
				record();
			});
		});
		record();
	} else {
		target.subscribe(function(value){
			if(!change || change(oldValue, value)) {
				element.__builder.rollback(recordId);
				record(value);
			}
		});
		record(target());
	}
};

Factory.compilecss = function(root){
	var ret = "";
	function compile(obj) {
		for(var selector in obj) {
			var value = obj[selector];
			if(typeof value == "object") {
				if(Object.keys(value).length) {
					ret += selector + "{";
					compile(value);
					ret += "}";
				}
			} else {
				if(selector == "content" && (value.charAt(0) != '"' || value.charAt(value.length - 1) != '"') && (value.charAt(0) != '\'' || value.charAt(value.length - 1) != '\'')) value = JSON.stringify(value);
				ret += selector + ":" + value + ";";
			}
		}
	}
	compile(root);
	return ret;
};

Factory.compilecssb = function(root){
	var ret = {};
	function compile(selectors, curr, obj) {
		for(var selector in obj) {
			var value = obj[selector];
			if(typeof value == "object") {
				if(selector.charAt(0) == '@') {
					if(selector.substring(1, 6) == "media") {
						var oret = ret;
						ret = {};
						compile(selectors, ret[selectors.join(',')] = {}, value);
						oret[selector] = ret;
						ret = oret;
					} else {
						ret[selector] = value;
					}
				} else {
					var ns = [];
					if(selectors.length) {
						selector.split(',').map(function(s2){
							var prefix = s2.indexOf('&') != -1;
							selectors.forEach(function(s1){
								if(prefix) ns.push(s2.trim().replace('&', s1));
								else ns.push(s1 + ' ' + s2.trim());
							});
						});
					} else {
						ns = selector.split(',').map(function(s){
							return s.trim();
						});
					}
					compile(ns, ret[ns.join(',')] = {}, value);
				}
			} else {
				curr[selector] = value;
			}
		}
	}
	compile([], ret, root);
	return Factory.compilecss(ret);
};

module.exports = Factory;
