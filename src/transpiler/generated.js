var SOURCE = 0;
var CONTEXT = 1;

/**
 * @class
 * @since 0.132.0
 */
function Generated(transpiler) {
	this.transpiler = transpiler;
	this.scope = {context: -1, children: []};
	this.fun;
	this.data = [];
}

/**
 * Adds data to the source.
 * @returns The added data.
 * @since 0.132.0
 */
Generated.prototype.add = function(type, value){
	var data = {type, value};
	this.data.push(data);
	return data;
};

/**
 * Adds raw source code to the source.
 * @returns The added object reference, which value field can later be modified without altering the array.
 * @since 0.132.0
 */
Generated.prototype.addSource = Generated.prototype.push = function(value){
	return this.add(SOURCE, value);
};

/**
 * @since 0.132.0
 */
Generated.prototype.addContext = function(){
	if(this.fun) {
		var context = "context" + this.fun.context;
		// check whether the current function is already injected
		if(!this.fun.injected) {
			this.fun.data.value = `var ${this.transpiler[context]}=${this.transpiler.runtime}.cfa` + (this.fun.prevContext == -1 ? "(" : `c(${this.transpiler["context" + this.fun.prevContext]}, `) + `${this.fun.args});`;
			this.fun.injected = true;
		}
		// add actual variable to source
		this.addSource(this.transpiler[context]);
	} else {
		this.addSource(this.transpiler.defaultContext);
	}
};

/**
 * @since 0.132.0
 */
Generated.prototype.addContextArg = function(){
	this.addSource(this.fun ? this.transpiler["context" + this.fun.context] : this.transpiler.defaultContext);
};

Generated.prototype.startScope = function(){
	var scope = {parent: this.scope, context: this.scope.context, prevContext: this.scope.prevContext, children: []};
	this.scope.children.push(scope);
	this.scope = scope;
};

Generated.prototype.startFunctionImpl = function(args){
	var scope = {
		parent: this.scope,
		prevContext: this.scope.context,
		context: (this.scope.context + 1) % 2,
		children: [],
		data: this.addSource(""),
		fun: true,
		args
	};
	this.scope.children.push(scope);
	this.scope = this.fun = scope;
};

Generated.prototype.startFunction = function(){
	this.startFunctionImpl("arguments");
};

Generated.prototype.startArrowFunction = function(){
	this.startFunctionImpl(this.transpiler.arguments);
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
	this.scope = this.scope.parent;
};

Generated.prototype.toString = function(){
	return this.data.map(({type, value}) => {
		return value;
	}).join("");
};

module.exports = Generated;
