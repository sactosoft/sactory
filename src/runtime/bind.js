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
			if(element.__builderInstance && element.dispatchEvent) element.dispatchEvent(new Event("remove"));
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
Sactory.bind = function(context, element, bind, anchor, target, change, cleanup, fun){
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
		if(cleanup) cleanup();
	}
	if(element) {
		currentAnchor = Sactory.createAnchor(element, bind, anchor);
		/* debug:
		currentAnchor.bind = currentBind;
		*/
	}
	change = SactoryObservable.unobserve(change);
	cleanup = SactoryObservable.unobserve(cleanup);
	if(change && typeof change != "function") throw new Error("The change argument provided to :bind is not a function.");
	if(cleanup && typeof cleanup != "function") throw new Error("The cleanup argument provided to :bind is not a function.");
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
			if(!change || change(oldValue, value)) {
				rollback();
				record(value);
			} else {
				oldValue = value;
			}
		}));
		record(target.value);
	} else {
		throw new Error("Cannot bind to the given value: not an observable or an array of observables.");
	}
};

/**
 * @since 0.40.0
 */
Sactory.bindIf = function(context, element, bind, anchor, target, change, cleanup, condition, fun){
	if(!target && SactoryObservable.isObservable(condition) && condition.computed) {
		target = condition.dependencies;
		if(target.length == 1) target = target[0];
	}
	condition = SactoryObservable.unobserve(condition);
	if(typeof condition != "function") throw new Error("The condition provided to :bind-if is not a function.");
	Sactory.bind(context, element, bind, anchor, target, change, cleanup, function(element, bind, anchor, value){
		if(condition()) fun.call(this, element, bind, anchor, value);
	});
};

/**
 * @since 0.40.0
 */
Sactory.bindEach = function(context, element, bind, anchor, target, change, cleanup, fun){
	Sactory.bind(context, element, bind, anchor, target, change, cleanup, function(element, bind, anchor, value){
		for(var i=0; i<value.length; i++) {
			fun.call(this, element, bind, anchor, value[i], i, value);
		}
	});
};

module.exports = Sactory;
