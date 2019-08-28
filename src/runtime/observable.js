var Polyfill = require("../polyfill");
var SactoryConst = require("./const");
var SactoryContext = require("./context");

var Sactory = {};

var setUpdate = typeof setImmediate == "function" ? setImmediate : setTimeout;

var subCount = 0;

/**
 * @class
 * @since 0.129.0
 */
function Subscription(observable, callback, type) {
	this.observable = observable;
	this.callback = callback;
	this.type = type;
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
	this._value = this.wrapValue(fun());
	this._calc = () => this.value = fun();
	this._subscriptions = [];
	this._dependencies = 0;
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
	this._dependencies += dependencies.length;
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
 * @since 0.130.0
 */
Observable.prototype.$$subscribe = function(context1, context2, callback, type){
	var subscription = this.subscribe(callback, type);
	var { bind } = SactoryContext.context(context1, context2);
	if(bind) {
		bind.subscribe(subscription);
	}
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
Observable.prototype.wrapValue = function(value){
	if(value instanceof Observable) {
		// copy observable
		value = value.value;
	}
	if(Array.isArray(value) || value instanceof Observable.Array) {
		// wrap in special container class
		return new Observable.Array(this, value);
	} else {
		return value;
	}
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
			this._value = this.wrapValue(value);
			this.propagateUpdate(value, oldValue);
		}
	}
});

// conversion

Observable.prototype.valueOf = function(){
	return this._value;
};

Observable.prototype.toJSON = function(){
	return this._value && this._value.toJSON ? this._value.toJSON() : this._value;
};

Observable.prototype.toString = function(){
	return this._value + "";
};

// modifiers

Observable.prototype.storage = function(storage, key, version){
	this._key = key + (version ? "__v" + version : "");
	var sup = this.propagateUpdate;
	Object.defineProperty(this, "propagateUpdate", {
		value(value) {
			storage.setItem(this._key, JSON.stringify(value));
			sup.apply(this, arguments);
		}
	});
	var item = storage.getItem(this._key);
	if(item) {
		this.value = JSON.parse(storage.getItem(this._key));
	}
	return this;
};

var noStorage = type => function(key){
	console.warn(type + " is not available. Observable assigned to key '" + key + "' will not be saved to it.");
	return this;
};

if(typeof localStorage != "undefined") {
	Observable.prototype.localStorage = function(key, version){
		return this.storage(localStorage, key, version);
	};
} else {
	Observable.prototype.localStorage = noStorage("localStorage");
}

if(typeof sessionStorage != "undefined") {
	Observable.prototype.sessionStorage = function(key, version){
		return this.storage(sessionStorage, key, version);
	};
} else {
	Observable.prototype.sessionStorage = noStorage("sessionStorage");
}

/**
 * @since 0.129.0
 */
Observable.prototype.nowrap = function(){
	Object.defineProperty(this, "wrapValue", {value: value => value});
};

/**
 * @since 0.129.0
 */
Observable.prototype.async = function(){
	var calc = this._calc;
	this._calc = () => {
		if(!this._updating) {
			this._updating = true;
			setUpdate(() => {
				this._updating = false;
				calc();
			});
		}
	};
	return this;
};

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

// wrappers

/**
 * @class
 * @since 0.66.0
 */
Observable.Array = (SysArray => {

	function Array(observable, value) {
		SysArray.call(this);
		SysArray.prototype.push.apply(this, value);
		Object.defineProperty(this, "observable", {
			enumerable: false,
			value: observable
		});
		var length = this.length;
		Object.defineProperty(this, "length", {
			configurable: false,
			enumerable: false,
			writable: true,
			value: length
		});
	}

	Array.prototype = Object.create(SysArray.prototype);

	[
		{name: "copyWithin"},
		{name: "fill"},
		{name: "pop", type: SactoryConst.OUT_ARRAY_POP},
		{name: "push", type: SactoryConst.OUT_ARRAY_PUSH},
		{name: "reverse"},
		{name: "shift", type: SactoryConst.OUT_ARRAY_SHIFT},
		{name: "sort"},
		{name: "splice", type: SactoryConst.OUT_ARRAY_SPLICE},
		{name: "unshift", type: SactoryConst.OUT_ARRAY_UNSHIFT}
	].forEach(({name, type}) => {
		if(SysArray.prototype[name]) {
			Object.defineProperty(Array.prototype, name, {
				enumerable: false,
				value() {
					var ret = SysArray.prototype[name].apply(this, arguments);
					this.observable.triggerUpdate(type, arguments);
					return ret;
				}
			});
		}
	});

	Object.defineProperty(Array.prototype, "set", {
		value(index, value) {
			this[index] = value;
			this.observable.triggerUpdate(SactoryConst.OUT_ARRAY_SET, [index, value]);
			return value;
		}
	});

	Object.defineProperty(Array.prototype, "toJSON", {
		value() {
			return SysArray.apply(null, this);
		}
	});

	return Array;
	
})(Array);

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

module.exports = Sactory;
