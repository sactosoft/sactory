var SactoryConfig = require("./config");
var SactoryObservable = require("./observable");

var Sactory = {};

function AttrValue(args) {
	this.args = args;
	this.length = args.length;
	for(var i in args) {
		this[i] = args[i];
	}
}

AttrValue.prototype.get = function(index){
	return this.args[index];
};

AttrValue.prototype.slice = function(){
	return new AttrValue(Array.prototype.slice.apply(this.args, arguments));
};

AttrValue.prototype.split = function(separator){
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
				if(splitted.length) {
					var last = splitted.pop();
					splitted.forEach(value => {
						push(value);
						curr = null;
					});
					if(last.length) push(last);
				}
			}
		}
	});
	return ret.map(a => new AttrValue(a));
};

AttrValue.prototype.toValue = function(){
	return this.args.length == 1 ? this.args[0] : this.toString();
};

AttrValue.prototype.toString = function(){
	return this.args.join("");
};

function BuilderObservable(fun, dependencies) {
	this.fun = fun;
	this.dependencies = dependencies;
}

BuilderObservable.prototype.use = function(bind){
	var ret = SactoryObservable.coff(this.fun);
	ret.addDependencies(this.dependencies, {bind});
	return ret;
};

/**
 * Checks whether the given version in compatible with the runtime version.
 * @throws {Error} When the given version is not compatible with the runtime version and `warn` is not true.
 * @since 0.32.0
 */
Sactory.check = function(version, warn){
	var transpiled = version.split(".");
	var runtime = Sactory.VERSION.split(".");
	if(transpiled[0] != runtime[0] || transpiled[1] != runtime[1]) {
		if(warn) {
			console.warn(`Code transpiled using version ${version} may not work properly in the current runtime environment using version ${Sactory.VERSION}.`);
		} else {
			throw new Error(`Code transpiled using version ${version} cannot be run in the current runtime environment using version ${Sactory.VERSION}.`);
		}
	}
};

/**
 * @since 0.139.0
 */
Sactory.document = function(context){
	if(context.document) {
		return context.document;
	} else if(typeof document != "undefined") {
		return document;
	} else {
		throw new Error("No document associated to the current context.");
	}
};

/**
 * @since 0.139.0
 */
Sactory.documentElement = function(context){
	return Sactory.document(context).documentElement;
};

/**
 * @since 0.139.0
 */
Sactory.root = function(context, composed){
	return context.element ? context.element.getRootNode({composed}) : Sactory.document(context);
};

/**
 * @since 0.139.0
 */
Sactory.head = function(context){
	return Sactory.document(context).head;
};

/**
 * @since 0.139.0
 */
Sactory.body = function(context){
	return Sactory.document(context).body;
};

/**
 * @since 0.32.0
 */
Sactory.unique = function(context, id, fun){
	var className = "unique-" + SactoryConfig.config.prefix + id;
	if(!(context.document || document).querySelector("." + className)) {
		var element = fun();
		element["~builder"].addClass(className, context.bind);
		return element;
	}
};

/**
 * @since 0.120.0
 */
Sactory.inherit = function(target, ...args){
	// merged in reverse so the first inherit tag is the less important
	args.reverse().forEach(options => {
		for(var i=0; i<Math.min(3, options.length); i++) {
			var option = options[i];
			if(option) {
				if(target[i]) target[i].unshift(...option);
				else target[i] = option;
			}
		}
	});
	return target;
};

/**
 * @since 0.130.0
 */
Sactory.$$on = function(context, element, name, value){
	element["~builder"].event(name, value, context.bind);
};

/**
 * @since 0.141.0
 */
Sactory.$$bindInput = function(context, element, type, {info, value, update}){
	element["~builder"].bind(context, type, info, value, update);
};

/**
 * @since 0.127.0
 */
Sactory.attr = function(...args){
	return new AttrValue(args);
};

/**
 * @since 0.129.0
 */
Sactory.bo = function(fun, dependencies, maybeDependencies){
	if(maybeDependencies) {
		Array.prototype.push.apply(dependencies, maybeDependencies.filter(SactoryObservable.isObservable));
	}
	if(dependencies.length) {
		return new BuilderObservable(fun, dependencies);
	} else {
		return fun();
	}
};

/**
 * @since 0.129.0
 */
Sactory.isBuilderObservable = function(value){
	return value instanceof BuilderObservable;
};

/**
 * @since 0.129.0
 */
Sactory.forEachArray = function(value, fun){
	value.forEach(fun);
};

/**
 * @since 0.129.0
 */
Sactory.forEachObject = function(value, fun){
	var index = 0;
	for(var key in value) {
		fun(key, value[key], index++, value);
	}
};

/**
 * @since 0.98.0
 */
Sactory.range = function(from, to, fun){
	if(from < to) {
		while(from < to) {
			fun(from++);
		}
	} else {
		while(from > to) {
			fun(from--);
		}
	}
};

/**
 * @since 0.138.0
 */
Sactory.stringify = function(value){
	switch(typeof value) {
		case "number":
		case "function":
			return value.toString();
		case "undefined":
			return "undefined";
		default:
			return JSON.stringify(value);
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
*/

module.exports = Sactory;
