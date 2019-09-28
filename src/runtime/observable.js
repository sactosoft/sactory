var Polyfill = require("../polyfill");
var SactoryConst = require("./const");
var counter = require("./counter");

var Sactory = {};

var setUpdate = typeof setImmediate == "function" ? setImmediate : setTimeout;

/**
 * @class
 * @since 0.129.0
 */
function Subscription(observable, callback, type) {
	Object.defineProperty(this, "id", {value: counter.nextSubscription()});
	this.observable = observable;
	this.callback = callback;
	this.type = type;
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
	Object.defineProperty(this, "id", {value: counter.nextObservable()});
	this._dependencies = 0;
	this._subscriptions = [];
	this._calc = () => this.value = fun();
	this._value = this.wrapValue(fun());
}

/**
 * @since 0.129.0
 */
Observable.prototype.recalc = function(){};

/**
 * @since 0.129.0
 */
Observable.prototype.addDependencies = function(dependencies, context){
	var subscriptions = dependencies.map(dependency => dependency.$$subscribe(context, this._calc));
	this._dependencies += dependencies.length;
	return subscriptions;
};

/**
 * @since 0.129.0
 */
Observable.prototype.addMaybeDependencies = function(dependencies, context){
	return this.addDependencies(dependencies.filter(Sactory.isObservable), context);
};

/**
 * @since 0.129.0
 */
Observable.prototype.subscribe = function(callback, type){
	var ret = new Subscription(this, callback, type);
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
Observable.prototype.$$subscribe = function(context, callback, type){
	var subscription = this.subscribe(callback, type);
	if(context && context.bind) {
		context.bind.subscribe(subscription);
	}
	return subscription;
};

/**
 * @since 0.132.0
 */
Observable.prototype.$$depend = function(context, ...dependencies){
	return this.addMaybeDependencies(dependencies, context);
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
		this.propagateUpdate(value, oldValue, type, args);
	}
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
 * @since 0.142.0
 */
Observable.prototype.always = function(){
	Object.defineProperty(this, "shouldUpdate", {value: () => true});
	return this;
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
Observable.prototype.d = function(context, ...dependencies){
	this.addDependencies(dependencies, context);
	return this;
};

/**
 * @since 0.129.0
 */
Observable.prototype.m = function(context, ...dependencies){
	this.addMaybeDependencies(dependencies, context);
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
 * @class
 * @since 0.145.0
 */
function RuntimeObservable(rfun) {
	this._tracker = new Tracker(this);
	Observable.call(this, rfun(this._tracker));
	this._tracker.disable();
}

RuntimeObservable.prototype = Object.create(Observable.prototype);

RuntimeObservable.prototype.d = function(context, ...dependencies){
	this._tracker.add(context, dependencies);
	Observable.prototype.d.call(this, context, ...dependencies);
	return this;
};

RuntimeObservable.prototype.m = function(context, ...dependencies){
	return this.d(context, ...dependencies.filter(Sactory.isObservable));
};

/**
 * @class
 * @since 0.145.0
 */
function Tracker(observable) {
	this._observable = observable;
	this._dependencies = [];
	this._enabled = this._internal = new TrackerEnabled(this._observable, this._dependencies);
	this._disabled = new TrackerDisabled();
}

Tracker.prototype.enable = function(){
	this._internal = this._enabled;
};

Tracker.prototype.disable = function(){
	this._internal = this._disabled;
};

/**
 * Adds a runtime dependency.
 */
Tracker.prototype.d = function(dep){
	return this._internal.d(dep);
};

/**
 * Adds a maybe runtime dependency.
 */
Tracker.prototype.m = function(dep){
	return this._internal.m(dep);
};

/**
 * Adds a hard dependency that will trigger a recalculation
 * of the runtime dependencies.
 */
Tracker.prototype.add = function(context, dependencies){
	dependencies.forEach(dep => {
		dep.$$subscribe(context, () => {
			this._observable._dependencies -= this._dependencies.length;
			this._dependencies.forEach(dep => dep.dispose());
			this._dependencies.length = 0;
			this.enable();
			this._observable._calc();
			this.disable();
		});
	});
};

/**
 * @class
 * @since 0.145.0
 */
function TrackerEnabled(observable, dependencies) {
	this._observable = observable;
	this._dependencies = dependencies;
}

TrackerEnabled.prototype.d = function(dep){
	if(!Polyfill.find.call(this._dependencies, value => value.observable.id == dep.id)) {
		this._dependencies.push(...this._observable.addDependencies([dep], {}));
	}
	return dep.value;
};

TrackerEnabled.prototype.m = function(dep){
	if(Sactory.isObservable(dep)) {
		return this.d(dep);
	} else {
		return dep;
	}
};

/**
 * @class
 * @since 0.145.0
 */
function TrackerDisabled() {}

TrackerDisabled.prototype.d = function(dep){
	return dep.value;
};

TrackerDisabled.prototype.m = function(dep){
	return Sactory.isObservable(dep) ? dep.value : dep;
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
 * Creates an observable from a function with runtime dependencies.
 * @since 0.144.0
 */
Sactory.cofr = function(fun){
	return new RuntimeObservable(fun);
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
