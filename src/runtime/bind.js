var Const = require("../const");

var SactoryCore = require("./core");
var SactoryObservable = require("./observable");

var Sactory = {};

/**
 * @class
 * @since 0.45.0
 */
function Bind(parent) {
	this.parent = parent;
	this.children = [];
	this.subscriptions = [];
	this.elements = [];
	this.rollbacks = [];
}

/**
 * @since 0.45.0
 */
Bind.prototype.fork = function(){
	var child = new Bind(this);
	this.children.push(child);
	return child;
}

/**
 * @since 0.45.0
 */
Bind.prototype.rollback = function(){
	if(this.subscriptions.length) {
		this.subscriptions.forEach(function(subscription){
			subscription.dispose();
		});
		this.subscriptions = [];
	}
	if(this.elements.length) {
		this.elements.forEach(function(element){
			if(element.__builderInstance && element.dispatchEvent) element.__builder.dispatchEvent("remove");
			if(element.parentNode) element.parentNode.removeChild(element);
		});
		this.elements = [];
	}
	if(this.rollbacks.length) {
		this.rollbacks.forEach(function(fun){
			fun();
		});
		this.rollbacks = [];
	}
	if(this.children.length) {
		this.children.forEach(function(child){
			child.rollback();
		});
		this.children = [];
	}
};

/**
 * @since 0.45.0
 */
Bind.prototype.subscribe = function(subscription){
	this.subscriptions.push(subscription);
};

/**
 * @since 0.45.0
 */
Bind.prototype.appendChild = function(element){
	this.elements.push(element);
};

/**
 * @since 0.64.0
 */
Bind.prototype.addRollback = function(fun){
	this.rollbacks.push(fun);
};

var factory = new Bind(null);

/**
 * @since 0.45.0
 */
Object.defineProperty(Sactory, "bindFactory", {
	get: function(){
		return factory;
	}
});

/**
 * @since 0.48.0
 */
Sactory.createAnchor = function(element, bind, anchor){
	var ret = document.createTextNode("");
	/* debug:
	ret = document.createComment("");
	*/
	Object.defineProperty(ret, "nodeType", {
		value: Node.ANCHOR_NODE
	});
	if(anchor) element.insertBefore(ret, anchor);
	else element.appendChild(ret);
	if(bind) bind.appendChild(ret);
	return ret;
};

/**
 * @since 0.11.0
 */
Sactory.bind = function(context, element, bind, anchor, target, fun){
	var currentBind = (bind || Sactory.bindFactory).fork();
	var currentAnchor = null;
	var oldValue;
	var subscribe = !bind ? function(){} : function(subscriptions) {
		if(bind) bind.subscribe(subscriptions);
	};
	function record(value) {
		fun.call(context, element, currentBind, currentAnchor, oldValue = value);
	}
	function rollback() {
		currentBind.rollback();
	}
	if(element) {
		currentAnchor = Sactory.createAnchor(element, bind, anchor);
		/* debug:
		currentAnchor.bind = currentBind;
		currentAnchor.textContent = " bind ";
		*/
	}
	if(target.observe) target = target.observe;
	if(target.forEach) {
		target.forEach(function(ob){
			subscribe(ob.subscribe(function(){
				rollback();
				record();
			}));
		});
		record();
	} else if(SactoryObservable.isObservable(target)) {
		subscribe(target.subscribe(function(value){
			rollback();
			record(value);
		}));
		record(target.value);
	} else {
		throw new Error("Cannot bind to the given value: not an observable or an array of observables.");
	}
};

/**
 * @since 0.102.0
 */
Sactory.bindIfElse = function(context, element, bind, anchor, conditions){
	var functions = Array.prototype.slice.call(arguments, 5);
	var currentBindDependencies = (bind || Sactory.bindFactory).fork();
	var currentBindContent = (bind || Sactory.bindFactory).fork();
	var currentAnchor;
	if(element) {
		currentAnchor = Sactory.createAnchor(element, bind, anchor);
	}
	// filter maybe observables
	conditions.forEach(function(condition){
		if(condition[2]) {
			Array.prototype.push.apply(condition[1], SactoryObservable.filterObservables(condition[2]));
		}
	});
	var active = 0xFEE1DEAD;
	var results;
	function reload() {
		// reset results
		results = conditions.map(function(condition){
			return null;
		});
		// calculate new results and call body
		for(var i=0; i<results.length; i++) {
			var condition = conditions[i];
			if(!condition[0] || (results[i] = !!condition[0].call(context))) {
				active = i;
				functions[i].call(context, element, currentBindContent, currentAnchor);
				return;
			}
		}
		// no result found
		active = 0xFEE1DEAD;
	}
	function recalc() {
		currentBindContent.rollback();
		reload();
	}
	conditions.forEach(function(condition, i){
		if(condition[1]) {
			condition[1].forEach(function(dependency){
				currentBindDependencies.subscribe(dependency.subscribe(function(){
					if(i <= active) {
						// the change may affect what is being displayed
						var result = !!condition[0].call(context);
						if(result != results[i]) {
							// the condition has changes, need to recalc
							results[i] = result;
							recalc();
						}
					}
				}));
			});
		}
	});
	reload();
};

/**
 * @since 0.102.0
 */
Sactory.bindEach = function(context, element, bind, anchor, target, getter, fun){
	if(getter.call(context).forEach) {
		var currentBind = (bind || Sactory.bindFactory).fork();
		var firstAnchor, lastAnchor;
		if(element) {
			firstAnchor = Sactory.createAnchor(element, bind, anchor);
			lastAnchor = Sactory.createAnchor(element, bind, anchor);
			/* debug:
			firstAnchor.textContent = " bind-each:first ";
			lastAnchor.textContent = " bind-each:last ";
			*/
		}
		var binds = [];
		function add(action, bind, anchor, value, index, array) {
			fun.call(context, element, bind, anchor, value, index, array);
			binds[action]({bind: bind, anchor: anchor});
		}
		function updateAll() {
			getter.call(context).forEach(function(value, index, array){
				add("push", currentBind.fork(), element ? Sactory.createAnchor(element, currentBind, lastAnchor) : null, value, index, array);
			});
		}
		currentBind.subscribe(target.subscribe(function(array, _, type, data){
			switch(type) {
				case Const.OBSERVABLE_UPDATE_TYPE_ARRAY_PUSH:
					Array.prototype.forEach.call(data, function(value, i){
						add("push", currentBind.fork(), element ? Sactory.createAnchor(element, currentBind, lastAnchor) : null, value, array.length - data.length + i, array);
					});
					break;
				case Const.OBSERVABLE_UPDATE_TYPE_ARRAY_POP:
					var popped = binds.pop();
					if(popped) {
						popped.bind.rollback();
						if(popped.anchor) popped.anchor.parentNode.removeChild(popped.anchor);
					}
					break;
				case Const.OBSERVABLE_UPDATE_TYPE_ARRAY_UNSHIFT:
					Array.prototype.forEach.call(data, function(value){
						add("unshift", currentBind.fork(), element ? Sactory.createAnchor(element, currentBind, firstAnchor.nextSibling) : null, value, 0, array);
					});
					break;
				case Const.OBSERVABLE_UPDATE_TYPE_ARRAY_SHIFT:
					var shifted = binds.shift();
					if(shifted) {
						shifted.bind.rollback();
						if(shifted.anchor) shifted.anchor.parentNode.removeChild(shifted.anchor);
					}
					break;
				case Const.OBSERVABLE_UPDATE_TYPE_ARRAY_SPLICE:
					// insert new elements then call splice on binds and rollback
					var index = data[0];
					var ptr = binds[index];
					var anchorTo = ptr && ptr.anchor && ptr.anchor.nextSibling;
					var args = [];
					Array.prototype.slice.call(data, 2).forEach(function(value){
						args.push({value: value});
					});
					Array.prototype.splice.apply(binds, Array.prototype.slice.call(data, 0, 2).concat(args)).forEach(function(removed){
						removed.bind.rollback();
						if(removed.anchor) removed.anchor.parentNode.removeChild(removed.anchor);
					});
					args.forEach(function(info, i){
						info.bind = currentBind.fork();
						info.anchor = anchorTo ? Sactory.createAnchor(element, currentBind, anchorTo) : null;
						fun.call(context, element, info.bind, info.anchor, info.value, i + index, array);
					});
					break;
				default:
					currentBind.rollback();
					binds = [];
					updateAll();
			}
		}));
		updateAll();
	} else {
		// use normal bind and Sactory.forEach
		Sactory.bind(context, element, bind, anchor, target, function(element, bind, anchor){
			SactoryCore.forEach(context, getter.call(context), function(){
				var args = [element, bind, anchor];
				Array.prototype.push.apply(args, arguments);
				fun.apply(context, args);
			});
		});
	}
};

/**
 * @since 0.102.0
 */
Sactory.bindEachMaybe = function(context, element, bind, anchor, target, getter, fun){
	if(SactoryObservable.isObservable(target)) {
		Sactory.bindEach(context, element, bind, anchor, target, getter, fun);
	} else {
		SactoryCore.forEach(context, getter.call(context), function(){
			var args = [element, bind, anchor];
			Array.prototype.push.apply(args, arguments);
			fun.apply(context, args);
		});
	}
};

/**
 * @since 0.58.0
 */
Sactory.subscribe = function(bind, observable, callback, type){
	var subscription = SactoryObservable.observe(observable, callback, type, true);
	if(bind) bind.subscribe(subscription);
	return subscription;
};

module.exports = Sactory;
