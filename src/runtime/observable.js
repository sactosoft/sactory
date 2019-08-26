var Polyfill = require("../polyfill");
var SactoryConst = require("./const");
var SactoryContext = require("./context");

var Sactory = {};

var subCount = 0;

/**
 * @class
 * @since 0.129.0
 */
function Subscription(observable, callback, type) {
	this.observable = observable;
	this.callback = callback;
	this.type;
	Object.defineProperty(this, "id", {value: subCount++});
}

/**
 * @since 0.129.0
 */
Subscription.prototype.dispose = function(){
	this.observable.unsubscribe(this);
};

/**
 * @class
 * @since 0.129.0
 */
function Observable(fun) {
	this._value = fun();
	this._calc = () => this.value = fun();
	this._subscriptions = [];
}

/**
 * @since 0.129.0
 */
Observable.prototype.recalc = function(){};

/**
 * @since 0.129.0
 */
Observable.prototype.addDependencies = function(dependencies, bind){
	var subscriptions = dependencies.map(dependency => dependency.subscribe(this._calc));
	if(bind) {
		subscriptions.forEach(subscription => bind.subscribe(subscription));
	}
};

/**
 * @since 0.129.0
 */
Observable.prototype.addMaybeDependencies = function(dependencies, bind){
	this.addDependencies(dependencies.filter(Sactory.isObservable));
};

/**
 * @since 0.129.0
 */
Observable.prototype.subscribe = function(callback, type){
	var ret = new Subscription(this, callback);
	this._subscriptions.push(ret);
	return ret;
};

/**
 * @since 0.129.0
 */
Observable.prototype.unsubscribe = function({id}){
	for(var i=0; i<this._subscriptions.length; i++) {
		var sub = this._subscriptions[i];
		if(sub.id == id) {
			this._subscriptions.splice(i, 1);
			return true;
		}
	}
	return false;
};

/**
 * @since 0.129.0
 */
Observable.prototype.propagateUpdate = function(newValue, oldValue, type, args){
	this._subscriptions.forEach(sub => {
		if(!sub.type || sub.type != type) {
			sub.callback(newValue, oldValue, type, args);
		}
	});
};

/**
 * @since 0.129.0
 */
Observable.prototype.triggerUpdate = function(type, args){
	this.propagateUpdate(this._value, this._value, type, args);
};

/**
 * Indicates whether the observable should update when the value is changed by
 * assigning the `value` property.
 * @since 0.129.0
 */
Observable.prototype.shouldUpdate = function(newValue, oldValue){
	return newValue !== oldValue;
};

/**
 * @since 0.129.0
 */
Object.defineProperty(Observable.prototype, "value", {
	configurable: true,
	get() {
		return this._value;
	},
	set(value) {
		if(this.shouldUpdate(this._value, value)) {
			var oldValue = this._value;
			this._value = value;
			this.propagateUpdate(value, oldValue);
		}
	}
});

// functions used internally

/**
 * @since 0.129.0
 */
Observable.prototype.d = function(context1, context2, ...dependencies){
	this.addDependencies(dependencies, SactoryContext.context(context1, context2).bind);
	return this;
};

/**
 * @since 0.129.0
 */
Observable.prototype.m = function(context1, context2, ...dependencies){
	this.addMaybeDependencies(dependencies, SactoryContext.context(context1, context2).bind);
	return this;
};

/**
 * Creates an observable from a function.
 * @since 0.129.0
 */
Sactory.coff = function(fun){
	return new Observable(fun);
};

/**
 * Creates an observable from a value.
 * @since 0.129.0
 */
Sactory.cofv = function(value){
	return new Observable(() => value);
};

/**
 * Indicates whether the given value is an instance of {@link Observable}.
 * @since 0.40.0
 */
Sactory.isObservable = function(value){
	return value instanceof Observable;
};

/**
 * If the given value is an observable returns the current value, otherwise
 * returns the given value.
 * @since 0.86.0
 */
Sactory.value = function(value){
	if(Sactory.isObservable(value)) {
		return value.value;
	} else {
		return value;
	}
};
