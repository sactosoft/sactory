var Polyfill = require("../polyfill");
var SactoryConst = require("./const");
var counter = require("./counter");

var Sactory = {};

/* debug:
const subscriptions = {};
Object.defineProperty(Sactory, "subscriptions", {get: () => Object.values(subscriptions)});
*/

/**
 * Stores a subscription to an observable.
 * @param {Observable} observed - The observable that dispatches the update.
 * @param {function(newValue, oldValue, type, args)} callback - Callback function called when the observable is updated.
 * @param {number=} type - If the type passed to the observable's update function matches the given type, the callback is not called.
 * @class
 * @since 0.129.0
 */
function Subscription(observed, callback, type) {
	Object.defineProperty(this, "id", {value: counter.nextSubscription()});
	this.observed = observed;
	this.callback = callback;
	this.type = type;
	this.disposed = false;
}

/**
 * Disposes the subscription and stops receiving updates from the
 * observed observable.
 * @since 0.129.0
 */
Subscription.prototype.dispose = function(){
	this.disposed = true;
	this.observed.unsubscribe(this);
};

/**
 * @param {ComputedObservable} observer - The computed observable that receives the update, if the subscription is a dependency.
 * @since 0.146.0
 */
function Dependency(observed, observer, callback) {
	Subscription.call(this, observed, callback);
	this.observer = observer;
}

Dependency.prototype = Object.create(Subscription.prototype);

/**
 * Stores an observable, its value and its subscribers.
 * @param {*} value - The initial value of the observable.
 * @class
 * @since 0.129.0
 */
function Observable(context, value) {
	Object.defineProperty(this, "id", {value: counter.nextObservable()});
	this.context = context;
	this.bindId = context.bind && context.bind.id;
	this._subscriptions = [];
	this._value = this.wrapValue(value);
}

/**
 * @since 0.145.0
 */
Observable.prototype.subscribeImpl = function(context, subscription){
	this._subscriptions.push(subscription);
	if(context && context.bind && context.bind.id !== this.bindId) {
		context.bind.subscribe(subscription);
	} /* debug: else if(context && context.bind) {
		context.bind.subscribe(subscription);
	}
	subscriptions[subscription.id] = subscription; */
	return subscription;
};

/**
 * @since 0.129.0
 */
Observable.prototype.subscribe = function(context, callback, type){
	this.subscribeImpl(context, new Subscription(this, callback, type));
};

/**
 * @since 0.145.0
 */
Observable.prototype.depend = function(context, callback, observer){
	return this.subscribeImpl(context, new Dependency(this, observer, callback));
};

/**
 * @param {Subscription} subscription
 * @returns Whether the subscription was removed.
 * @since 0.129.0
 */
Observable.prototype.unsubscribe = function({id}){
	for(let i=0; i<this._subscriptions.length; i++) {
		const sub = this._subscriptions[i];
		if(sub.id == id) {
			this._subscriptions.splice(i, 1);
			/* debug: delete subscriptions[id]; */
			return true;
		}
	}
	return false;
};

/**
 * @since 0.130.0
 */
Observable.prototype.$$subscribe = function(context, callback, type){
	return this.subscribe(context, callback, type);
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
 * @since 0.129.0
 */
Observable.prototype.update = function(value, type, args){
	if(this.shouldUpdate(this._value, value)) {
		var oldValue = this._value;
		this._value = this.wrapValue(value);
		this.propagateUpdate(value, oldValue, type || this.currentType, args);
	}
};

/**
 * Indicates whether the observable should update when the value is changed by
 * calling the `update` method. It is true by default on normal observables
 * and is only true in computed observables when `newValue` is different from
 * `oldValue`.
 * @since 0.129.0
 */
Observable.prototype.shouldUpdate = function(newValue, oldValue){
	return true;
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
		this.update(value);
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
	return this;
};

/**
 * @since 0.145.0
 */
Observable.prototype.transform = function(fun){
	if(this.converters) {
		this.converters.push(fun);
	} else {
		this.converters = [fun];
		const wrapValue = this.wrapValue;
		Object.defineProperty(this, "wrapValue", {
			value(value) {
				this.converters.forEach(fun => value = fun(value));
				return wrapValue.call(this, value);
			}
		});
	}
	return this;
};

/**
 * @since 0.145.0
 */
Observable.prototype.validate = function(fun, defaultValue){
	return this.transform(value => fun(value) ? value : defaultValue);
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
 * @class
 * @since 0.145.0
 */
function ComputedObservable(context, fun){
	Observable.call(this, context);
	this.fun = fun;
	this.deps = this.ndeps = {};
	this.tracker = new Tracker(this);
	this._value = this.wrapValue(fun(this.tracker));
	this.ndeps = {};
}

ComputedObservable.prototype = Object.create(Observable.prototype);

ComputedObservable.prototype.recalc = function(){
	// store the ids of dependencies before recalc
	this.odeps = Polyfill.assign({}, this.deps);
	this.value = this.fun(this.tracker);
	// remove unused dependencies
	for(let id in this.odeps) {
		if(!this.ndeps[id]) {
			this.odeps[id].dispose();
		}
	}
	this.deps = this.ndeps;
	this.odeps = this.ndeps = {};
};

ComputedObservable.prototype.shouldUpdate = function(newValue, oldValue){
	return newValue !== oldValue;
};

/**
 * @since 0.142.0
 */
Observable.prototype.always = function(){
	Object.defineProperty(this, "shouldUpdate", {value: () => true});
	return this;
};

/**
 * @since 0.147.0
 */
ComputedObservable.prototype.throttle = function(duration){
	Object.defineProperty(this, "recalc", {
		value() {
			if(this._throttle) {
				// already throttling, reset it
				clearTimeout(this._throttle);
			}
			this._throttle = setTimeout(() => {
				ComputedObservable.prototype.recalc.call(this);
			}, duration);
		}
	});
	return this;
};

/**
 * @since 0.147.0
 */
ComputedObservable.prototype.lazy = function(){
	return this.throttle(0);
};

/*const notracker = {
	a: value => value.value,
	b: value => Sactory.isObservable(value) ? value.value : value,
	c: (value, fun) => fun(notracker, value.value),
	d: (value, fun) => fun(notracker, Sactory.isObservable(value) ? value.value : value)
};*/

/**
 * @class
 * @since 0.145.0
 */
function Tracker(observable) {
	this.observable = observable;
	this.context = observable.context;
}

Tracker.prototype.add = function(observable){
	const {id} = observable;
	if(!this.observable.deps[id]) {
		this.observable.ndeps[id] = observable.depend(this.context, () => {
			this.observable.recalc();
		}, this.observable);
	} else {
		this.observable.ndeps[id] = this.observable.deps[id];
	}
};

/**
 * Adds a dependency.
 */
Tracker.prototype.a = function(value){
	this.add(value);
	return value.value;
};

/**
 * Adds a maybe dependency.
 */
Tracker.prototype.b = function(value){
	if(Sactory.isObservable(value)) {
		return this.a(value);
	} else {
		return value;
	}
};

/**
 * Adds a dependency and calls the function.
 */
Tracker.prototype.c = function(value, fun){
	this.add(value);
	return fun(this, value.value);
};

/**
 * Adds a maybe dependency and calls the function.
 */
Tracker.prototype.d = function(value, fun){
	if(Sactory.isObservable(value)) {
		return this.c(value, fun);
	} else {
		return fun(this, value);
	}
};

/**
 * Creates an observable from the given value.
 * @since 0.129.0
 */
Sactory.cofv = function(context, value){
	return new Observable(context, value);
};

/**
 * Creates a computed observable from the given function.
 * @since 0.129.0
 */
Sactory.coff = function(context, fun){
	return new ComputedObservable(context, fun);
};

/**
 * Indicates whether the given value is an instance of {@link Observable}.
 * @since 0.40.0
 */
Sactory.isObservable = function(value){
	return value instanceof Observable;
};

/**
 * If the given value is an observable returns the observable's value,
 * otherwise returns the given value.
 * @since 0.86.0
 */
Sactory.value = function(value){
	if(Sactory.isObservable(value)) {
		return value.value;
	} else {
		return value;
	}
};

// export
Sactory.Subscription = Subscription;
Sactory.Observable = Observable;

module.exports = Sactory;
