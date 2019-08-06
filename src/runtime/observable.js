var Polyfill = require("../polyfill");
var Const = require("../const");

var Sactory = {};

/**
 * @class
 * @since 0.42.0
 */
function Observable(value) {
	this.internal = {
		originalValue: value,
		value: this.replace(value),
		snaps: {},
		count: 0,
		subscriptions: {},
		mods: []
	};
	this.updateType = undefined;
	this.updateDate = undefined;
	/* debug:
	var id = Math.floor(Math.random() * 100000);
	Object.defineProperty(this, "id", {
		value: id
	});
	*/
}

Observable.prototype.deep = false;

Observable.prototype.diff = true;

Observable.prototype.computed = false;

Observable.prototype.replace = function(value){
	if(value && typeof value == "object") {
		if(value.constructor === Array || value.constructor === ObservableArray) return new ObservableArray(this, value);
		else if(value.constructor === Date) return new ObservableDate(this, value);
		else if(value.constructor === ObservableDate) return new ObservableDate(this, value.date);
		else return value;
	} else {
		return value;
	}
};

/**
 * @since 0.42.0
 */
Observable.prototype.update = function(value){
	this.updateImpl(arguments.length ? this.replace(value) : this.internal.value, this.updateType, this.updateData);
	this.updateType = undefined;
	this.updateDate = undefined;
};

Observable.prototype.updateImpl = function(value, type, data){
	var oldValue = this.internal.value;
	this.internal.value = value;
	for(var i in this.internal.subscriptions) {
		var subscription = this.internal.subscriptions[i];
		if(!subscription.type || subscription.type !== type) subscription.callback(value, oldValue, type, data);
	}
};

/**
 * @since 0.42.0
 */
Observable.prototype.subscribe = function(callback, type){
	var id = this.internal.count++;
	var subs = this.internal.subscriptions;
	var subscription = this.internal.subscriptions[id] = {
		type: type,
		callback: callback
	};
	return {
		to: this,
		subscription: subscription,
		dispose: function(){
			delete subs[id];
		}
	};
};

/**
 * @since 0.105.0
 */
Observable.prototype.reset = function(){
	this.value = this.internal.originalValue;
};

Observable.prototype.valueOf = function(){
	return this.internal.value;
};

Observable.prototype.toJSON = function(){
	return this.internal.value && this.internal.value.toJSON ? this.internal.value.toJSON() : this.internal.value;
};

Observable.prototype.toString = function(){
	return this.internal.value + "";
};

/**
 * @since 0.42.0
 */
Object.defineProperty(Observable.prototype, "value", {
	configurable: true,
	get: function(){
		return this.internal.value;
	},
	set: function(value){
		if(value !== this.internal.value) {
			this.update(value);
		}
	}
});

/**
 * @since 0.105.0
 */
Observable.prototype.is = function(mod){
	return this.internal.mods.indexOf(mod) != -1;
};

/**
 * @since 0.105.0
 */
Observable.prototype.lazy = function(){
	Object.defineProperty(this, "value", {
		configurable: true,
		get: function(){
			if(this.internal.changed) {
				this.internal.changed = false;
				this.update(this.internal.value);
			}
			return this.internal.value;
		},
		set: function(value){
			if(value !== this.internal.value) {
				this.internal.changed = true;
				this.internal.value = value;
			}
		}
	});
	this.internal.mods.push("lazy");
	return this;
};

/**
 * @class
 * @since 0.81.0
 */
function DeepObservable(value) {
	Observable.call(this, value);
}

DeepObservable.prototype = Object.create(Observable.prototype);

DeepObservable.prototype.deep = true;

DeepObservable.prototype.replace = function(value){
	return this.observeChildren(value, []);
};

DeepObservable.prototype.makeChild = function(value, path){
	if(value && typeof value == "object") {
		this.observeChildren(value, path);
	}
	return value;
};

DeepObservable.prototype.observeChildren = function(value, path){
	var $this = this;
	Object.keys(value).forEach(function(key){
		var currentPath = path.concat(key);
		var childValue = $this.makeChild(value[key], currentPath);
		Object.defineProperty(value, key, {
			enumerable: true,
			get: function(){
				$this.lastPath = currentPath;
				return childValue;
			},
			set: function(newValue){
				childValue = $this.makeChild(newValue, currentPath);
				$this.update();
			}
		});
	});
	return value;
};

/**
 * @since 0.66.0
 */
DeepObservable.prototype.merge = function(object){
	var update = this.update;
	this.update = function(){}; // disable update
	this.mergeImpl(this.internal.value, object);
	this.update = update; // enable update
	this.update();
};

DeepObservable.prototype.mergeImpl = function(value, object){
	for(var key in object) {
		if(typeof value[key] == "object" && typeof object[key] == "object") {
			this.mergeImpl(value[key], object[key]);
		} else {
			value[key] = object[key];
		}
	}
};

/**
 * @class
 * @since 0.97.0
 */
function AlwaysObservable(value) {
	Observable.call(this, value);
}

AlwaysObservable.prototype = Object.create(Observable.prototype);

AlwaysObservable.prototype.diff = false;

Object.defineProperty(AlwaysObservable.prototype, "value", {
	configurable: true,
	get: function(){
		return this.internal.value;
	},
	set: function(value){
		this.update(value);
	}
});

/**
 * @since 0.54.0
 */
function makeSavedObservable(T, defaultValue, storage) {

	var observable, handleReturn;

	if(typeof Promise == "function") {
		handleReturn = function(ret){
			if(ret instanceof Promise) {
				// do not call this.updateImpl to avoid saving
				ret.then(value => Observable.prototype.updateImpl.call(observable, value));
				return true;
			} else {
				return false;
			}
		};
	} else {
		handleReturn = () => false;
	}

	if(storage.get) {
		var ret = storage.get(defaultValue);
		observable = new T(handleReturn(ret) ? defaultValue : ret);
	} else {
		observable = new T(defaultValue);
	}

	observable.storage = storage;

	observable.updateImpl = function(value, type){
		storage.set(value);
		Observable.prototype.updateImpl.call(this, value, type);
	};

	return observable;

}

/**
 * @class
 * @since 0.66.0
 */
function ObservableArray(observable, value) {
	Array.call(this);
	Array.prototype.push.apply(this, value);
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

ObservableArray.prototype = Object.create(Array.prototype);

[
	{name: "copyWithin"},
	{name: "fill"},
	{name: "pop", type: Const.OBSERVABLE_UPDATE_TYPE_ARRAY_POP},
	{name: "push", type: Const.OBSERVABLE_UPDATE_TYPE_ARRAY_PUSH},
	{name: "reverse"},
	{name: "shift", type: Const.OBSERVABLE_UPDATE_TYPE_ARRAY_SHIFT},
	{name: "sort"},
	{name: "splice", type: Const.OBSERVABLE_UPDATE_TYPE_ARRAY_SPLICE},
	{name: "unshift", type: Const.OBSERVABLE_UPDATE_TYPE_ARRAY_UNSHIFT}
].forEach(function(fun){
	if(Array.prototype[fun.name]) {
		Object.defineProperty(ObservableArray.prototype, fun.name, {
			enumerable: false,
			value: function(){
				var ret = Array.prototype[fun.name].apply(this, arguments);
				this.observable.updateType = fun.type;
				this.observable.updateData = arguments;
				this.observable.update();
				return ret;
			}
		});
	}
});

Object.defineProperty(ObservableArray.prototype, "toJSON", {
	value: function(){
		return Array.apply(null, this);
	}
});

/**
 * @class
 * @since 0.66.0
 */
function ObservableDate(observable, value) {
	Date.call(this);
	Object.defineProperty(this, "date", {
		enumerable: false,
		value: value
	});
	Object.defineProperty(this, "observable", {
		enumerable: false,
		value: observable
	});
}

ObservableDate.prototype = Object.create(Date.prototype);

Object.getOwnPropertyNames(Date.prototype).forEach(function(fun){
	if(Polyfill.startsWith.call(fun, "set")) {
		Object.defineProperty(ObservableDate.prototype, fun, {
			enumerable: false,
			value: function(){
				var ret = Date.prototype[fun].apply(this.date, arguments);
				this.observable.update();
				return ret;
			}
		});
	} else {
		Object.defineProperty(ObservableDate.prototype, fun, {
			enumerable: false,
			value: function(){
				return Date.prototype[fun].apply(this.date, arguments);
			}
		});
	}
});

/**
 * @class
 * @since 0.54.0
 */
function StorageObservableProvider(storage, key) {
	this.storage = storage;
	this.key = key;
}

StorageObservableProvider.prototype.get = function(defaultValue){
	var item = this.storage.getItem(this.key);
	return item === null ? defaultValue : JSON.parse(item);
};

StorageObservableProvider.prototype.set = function(value){
	this.storage.setItem(this.key, JSON.stringify(value));
};

/**
 * Indicates whether the given value is an instanceof {@link Observable}.
 * @since 0.40.0
 */
Sactory.isObservable = function(value){
	return value instanceof Observable;
};

/**
 * Subscribes to the observables and, optionally, calls the callback with the current value.
 * @returns The new subscription.
 * @since 0.40.0
 */
Sactory.observe = function(value, callback, type, subscribeOnly){
	var ret = value.subscribe(callback, type);
	if(!subscribeOnly) callback(value.value);
	return ret;
};

/**
 * If the given value is an observable, returns the unobserved value. If the value
 * is a computed observable also disposes the subscriptions.
 * @since 0.42.0
 */
Sactory.unobserve = function(value){
	if(Sactory.isObservable(value)) {
		if(value.computed) {
			value.subscriptions.forEach(function(subscription){
				subscription.dispose();
			});
		}
		return value.value;
	} else {
		return value;
	}
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

/**
 * @since 0.81.0
 */
Sactory.observableImpl = function(T, value, storage, key){
	if(storage) {
		if(storage instanceof Storage) {
			return makeSavedObservable(T, value, new StorageObservableProvider(storage, key));
		} else if(typeof storage == "object") {
			return makeSavedObservable(T, value, storage);
		} else if(window.localStorage) {
			return makeSavedObservable(T, value, new StorageObservableProvider(window.localStorage, storage));
		} else {
			console.warn("window.localStorage is unavailable. '" + storage + "' will not be stored.");
		}
	}
	return new T(value);
};

/**
 * @since 0.41.0
 */
Sactory.observable = function(value, storage, key){
	return Sactory.observableImpl(Observable, value, storage, key);
};

/**
 * @since 0.81.0
 */
Sactory.observable.deep = function(value, storage, key){
	return Sactory.observableImpl(DeepObservable, value, storage, key);
};

/**
 * @since 0.81.0
 */
Sactory.observable.always = function(value, storage, key){
	return Sactory.observableImpl(AlwaysObservable, value, storage, key);
};

/**
 * @since 0.81.0
 */
Sactory.computedObservableImpl = function(T, context, bind, observables, fun, maybe){
	if(maybe) Array.prototype.push.apply(observables, Sactory.filterObservables(maybe));
	var ret = new T(fun.call(context));
	ret.computed = true;
	ret.dependencies = observables;
	ret.subscriptions = [];
	observables.forEach(function(observable){
		ret.subscriptions.push(observable.subscribe(function(){
			ret.value = fun.call(context);
		}));
	});
	if(bind) {
		ret.subscriptions.forEach(function(subscription){
			bind.subscribe(subscription);
		});
	}
	return ret;
};

/**
 * @since 0.48.0
 */
Sactory.computedObservable = function(context, bind, observables, fun, maybe){
	return Sactory.computedObservableImpl(Observable, context, bind, observables, fun, maybe);
};

/**
 * @since 0.81.0
 */
Sactory.computedObservable.deep = function(context, bind, observables, fun, maybe){
	return Sactory.computedObservableImpl(DeepObservable, context, bind, observables, fun, maybe);
};

/**
 * @since 0.97.0
 */
Sactory.computedObservable.deps = function(context, bind, observables, fun, maybe, deps){
	Array.prototype.push.apply(observables, deps instanceof Array ? deps : Array.prototype.slice.call(arguments, 5));
	return Sactory.computedObservableImpl(Observable, context, bind, observables, fun, maybe);
};

/**
 * @since 0.92.0
 */
Sactory.computedObservable.always = function(context, bind, observables, fun, maybe){
	return Sactory.computedObservableImpl(AlwaysObservable, context, bind, observables, fun, maybe);
};

/**
 * @since 0.86.0
 */
Sactory.maybeComputedObservable = function(context, bind, observables, fun, maybe){
	Array.prototype.push.apply(observables, Sactory.filterObservables(maybe));
	if(observables.length) {
		return Sactory.computedObservable(context, bind, observables, fun);
	} else {
		return fun.call(context);
	}
};

/**
 * @since 0.86.0
 */
Sactory.filterObservables = function(maybe){
	return maybe.filter(Sactory.isObservable);
};

module.exports = Sactory;
