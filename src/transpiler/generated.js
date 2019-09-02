var Polyfill = require("../polyfill");

var SOURCE = 0;
var CONTEXT = 1;

/**
 * @class
 * @since 0.132.0
 */
function Generated(transpiler) {
	this.transpiler = transpiler;
	this.scope = {context: 0, children: []};
	this.fun;
	this.data = [];
}

/**
 * @since 0.132.0
 */
Generated.prototype.fork = function(){
	var ret = new Generated(this.transpiler);
	ret.scope.context = this.scope.context;
	return ret;
};

/**
 * Gets the last element in the array of generated source.
 * @since 0.132.0
 */
Generated.prototype.tail = function(){
	return this.data[this.data.length - 1];
};

/**
 * Adds data to the source.
 * @returns The added data.
 * @since 0.132.0
 */
Generated.prototype.add = function(type, value, isolate){
	var data;
	if(!isolate && this.data.length && !(data = this.data[this.data.length - 1]).type) {
		data.value += value;
	} else {
		data = {type: isolate ? "isolated" : "", value};
		this.data.push(data);
	}
	return data;
};

/**
 * Adds raw source code to the source.
 * @returns The added object reference, which value field can later be modified without altering the array.
 * @since 0.132.0
 */
Generated.prototype.addSource = Generated.prototype.push = function(value, isolate){
	return this.add(SOURCE, value, isolate);
};

Generated.prototype.addIsolatedSource = function(value){
	return this.addSource(value, true);
};

Generated.prototype.injectFunctionContext = function(scope){
	if(!scope.injected) {
		if(scope.args.data) {
			// it's an arrow function, need to inject the arguments too
			if(scope.args.wrapped) {
				var value = scope.args.data.value.trim();
				var comma = value.lastIndexOf(",");
				var arg = value.substr(comma + 1).trim();
				if(Polyfill.startsWith.call(arg, "...") && !Polyfill.endsWith.call(arg, "]")) {
					// do not inject, use arguments from already existing spread syntax
					scope.args = arg.substr(3);
				} else if(comma == -1 ? value.length : arg.length) {
					// inject comma and arguments
					scope.args.data.value += ", ..." + (scope.args = this.transpiler.arguments);
				} else  {
					// there's already a comma or it's not needed
					scope.args.data.value += "..." + (scope.args = this.transpiler.arguments);
				}
			} else {
				scope.args.data.value = `(${scope.args.data.value}, ...${scope.args = this.transpiler.arguments})`;
			}
		}
		//scope.data.value = `var ${this.transpiler["context" + scope.context]}=${this.transpiler.runtime}.cfa` + (scope.prevContext == -1 ? "(" : `c(${this.transpiler["context" + scope.prevContext]}, `) + `${scope.args});`;
		scope.data.value = `var ${this.transpiler["context" + scope.context]}=${this.transpiler.runtime}.cfac(${this.transpiler["context" + scope.prevContext]}, ${scope.args});`;
		scope.injected = true;
	}
};

/**
 * @since 0.132.0
 */
Generated.prototype.addContext = function(){
	if(this.fun) {
		var context = "context" + this.fun.context;
		// check whether the current function is already injected
		var scope = this.fun;
		do {
			if(scope.fun) {
				this.injectFunctionContext(scope);
			}
		} while(scope = scope.parent);
		// add actual variable to source
		this.addSource(this.transpiler[context]);
	} else {
		this.addSource(this.transpiler.context0);
	}
};

/**
 * @since 0.132.0
 */
Generated.prototype.addContextArg = function(){
	this.addSource(this.getContextArg());
};

/**
 * @since 0.132.0
 */
Generated.prototype.getContextArg = function(){
	return this.fun ? this.transpiler["context" + this.fun.context] : this.transpiler.context0;
};

Generated.prototype.startScope = function(after){
	var scope = {
		parent: this.scope,
		context: this.scope.context,
		prevContext: this.scope.prevContext,
		children: [],
		after
	};
	this.scope.children.push(scope);
	this.scope = scope;
};

Generated.prototype.startFunctionImpl = function(args){
	var scope = {
		parent: this.scope,
		prevContext: this.scope.context,
		context: (this.scope.context + 1) % 2,
		children: [],
		data: this.addIsolatedSource(""),
		fun: true,
		args
	};
	this.scope.children.push(scope);
	this.scope = this.fun = scope;
};

Generated.prototype.startFunction = function(){
	this.startFunctionImpl("arguments");
};

Generated.prototype.startArrowFunction = function(info){
	this.startFunctionImpl(info);
};

Generated.prototype.endScope = function(){
	if(this.scope.fun) {
		// search for closest parent function
		var parent = this.scope.parent;
		while(parent && !parent.fun) {
			parent = parent.parent;
		}
		this.fun = parent;
	}
	if(this.scope.after) this.addSource(this.scope.after);
	this.scope = this.scope.parent;
};

Generated.prototype.toString = function(){
	return this.data.map(({type, value}) => {
		return value;
	}).join("");
};

module.exports = Generated;
