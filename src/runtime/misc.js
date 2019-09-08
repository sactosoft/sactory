var SactoryConfig = require("./config");
var SactoryContext = require("./context");
var SactoryObservable = require("./observable");
var counter = require("./counter");

var Sactory = {};

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
	return ret.map(a => new Attr(a));
};

Attr.prototype.toValue = function(){
	return this.args.length == 1 ? this.args[0] : this.toString();
};

Attr.prototype.toString = function(){
	return this.args.join("");
};

function BuilderObservable(fun, dependencies) {
	this.fun = fun;
	this.dependencies = dependencies;
}

BuilderObservable.prototype.use = function(bind){
	var ret = SactoryObservable.coff(this.fun);
	ret.addDependencies(this.dependencies, bind);
	return ret;
};

/**
 * Checks whether the given version in compatible with the runtime version.
 * @throws {Error} When the given version is not compatible with the runtime version and `warn` is not true.
 * @since 0.32.0
 */
Sactory.check = function(version, warn){
	var transpiled = version.split('.');
	var runtime = Sactory.VERSION.split('.');
	if(transpiled[0] != runtime[0] || transpiled[1] != runtime[1]) {
		if(warn) {
			console.warn(`Code transpiled using version ${version} may not work properly in the current runtime environment using version ${Sactory.VERSION}.`);
		} else {
			throw new Error(`Code transpiled using version ${version} cannot be run in the current runtime environment using version ${Sactory.VERSION}.`);
		}
	}
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
	// the last two options (widget and namespace) are assigned only if
	// the target does not have them and the inheritance does
	for(var i=3; i<5; i++) {
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
		for(var i=0; i<Math.min(3, options.length); i++) {
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
 * @since 0.130.0
 */
Sactory.$$on = function(context, element, name, value){
	element["~builder"].event(name, value, context.bind);
};

/**
 * @since 0.127.0
 */
Sactory.attr = function(...args){
	return new Attr(args);
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
		for(var i=from; i<to; i++) {
			fun(i);
		}
	} else {
		for(var i=from; i>to; i--) {
			fun(i);
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
					return make(factory);
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
