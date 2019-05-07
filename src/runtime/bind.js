var Sactory = {};

/**
 * @class
 * @since 0.45.0
 */
function Bind() {
	this.children = [];
	this.subscriptions = [];
	this.elements = [];
}

/**
 * @since 0.45.0
 */
Bind.prototype.create = function(){
	return new Bind();
};

/**
 * @since 0.45.0
 */
Bind.prototype.fork = function(){
	var child = this.create();
	this.children.push(child);
	return child;
}

/**
 * @since 0.45.0
 */
Bind.prototype.merge = function(bind){
	Array.prototype.push.apply(this.children, bind.children);
	Array.prototype.push.apply(this.subscriptions, bind.subscriptions);
	Array.prototype.push.apply(this.elements, bind.elements);
};

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

var factory = new Bind();

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
Sactory.bind = function(type, context, element, bind, anchor, target, change, cleanup, fun){
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
		if(cleanup) cleanup();
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
	cleanup = Sactory.unobserve(cleanup);
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
Sactory.bindIf = function(type, context, element, bind, anchor, target, change, cleanup, condition, fun){
	if(!target && Sactory.isContainerObservable(condition)) target = condition.observe;
	condition = Sactory.unobserve(condition);
	if(typeof condition != "function") throw new Error("The condition provided to :bind-if is not a function.");
	Sactory.bind(type, context, element, bind, anchor, target, change, cleanup, function(element, bind, anchor, value){
		if(condition()) fun.call(this, element, bind, anchor, value);
	});
};

/**
 * @since 0.40.0
 */
Sactory.bindEach = function(type, context, element, bind, anchor, target, change, cleanup, fun){
	Sactory.bind(type, context, element, bind, anchor, target, change, cleanup, function(element, bind, anchor, value){
		value.forEach(function(currentValue, index, array){
			fun.call(context, element, bind, anchor, currentValue, index, array);
		});
	});
};

module.exports = Sactory;
