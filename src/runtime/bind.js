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
			if(element.__builderInstance && element.__builder.beforeremove) element.__builder.beforeremove.call(element);
			if(element.parentNode) element.parentNode.removeChild(element);
		});
		this.elements = [];
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
 * @since 0.48.0
 */
Bind.createAnchor = function(){
	return this.anchor = document.createComment("");
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
	function rollback(value) {
		currentBind.rollback();
		if(cleanup) cleanup();
		record(value);
	}
	if(element) {
		currentAnchor = Bind.createAnchor();
		currentAnchor.__bind = currentBind;
		if(anchor) element.insertBefore(currentAnchor, anchor);
		else element.appendChild(currentAnchor);
		if(bind) bind.appendChild(currentAnchor);
	}
	change = SactoryObservable.unobserve(change);
	cleanup = SactoryObservable.unobserve(cleanup);
	if(change && typeof change != "function") throw new Error("The change argument provided to :bind is not a function.");
	if(cleanup && typeof cleanup != "function") throw new Error("The cleanup argument provided to :bind is not a function.");
	if(target.observe) target = target.observe;
	if(target.forEach) {
		target.forEach(function(ob){
			subscribe(ob.subscribe(rollback));
		});
		record();
	} else if(SactoryObservable.isObservable(target)) {
		subscribe(target.subscribe(function(value){
			if(!change || change(oldValue, value)) {
				rollback(value);
			}
		}));
		if(SactoryObservable.isOwnObservable(target)) {
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
Sactory.bindIf = function(context, element, bind, anchor, target, change, cleanup, condition, fun){
	if(!target && SactoryObservable.isContainerObservable(condition)) target = condition.observe;
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
