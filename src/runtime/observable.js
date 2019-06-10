var Sactory = {};

/**
 * @class
 * @since 0.42.0
 */
function Observable(value) {
	this.internal = {
		value: this.replace(value),
		snaps: {},
		count: 0,
		subscriptions: {}
	};
}

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
Observable.prototype.update = function(value, type){
	this.updateImpl(arguments.length ? this.replace(value) : this.internal.value, type);
};

Observable.prototype.updateImpl = function(value, type){
	var oldValue = this.internal.value;
	this.internal.value = value;
	for(var i in this.internal.subscriptions) {
		var subscription = this.internal.subscriptions[i];
		if(!subscription.type || subscription.type !== type) subscription.callback(value, oldValue, type);
	}
};

/**
 * @since 0.66.0
 */
Observable.prototype.merge = function(object){
	this.mergeImpl(this.internal.value, object);
	this.update();
};

Observable.prototype.mergeImpl = function(value, object){
	for(var key in object) {
		if(typeof object[key] =="object" && value[key] == "object") {
			this.mergeImpl(value[key], object[key]);
		} else {
			value[key] = object[key];
		}
	}
};

/**
 * @since 0.49.0
 */
Observable.prototype.snap = function(id){
	this.internal.snaps[id] = this.internal.value;
};

/**
 * @since 0.49.0
 */
Observable.prototype.snapped = function(id){
	return id in this.internal.snaps ? this.internal.snaps[id] : this.internal.value;
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
	get: function(){
		return this.internal.value;
	},
	set: function(value){
		this.update(value);
	}
});

/**
 * @class
 * @since 0.81.0
 */
function DeepObservable(value) {
	Observable.call(this, value);
}

DeepObservable.prototype = Object.create(Observable.prototype);

DeepObservable.prototype.replace = function(value){
	return this.observeChildren(value, []);
};

DeepObservable.prototype.makeChild = function(value, path){
	var ret = Object(value);
	Object.defineProperty(ret, "__parentObservable", {
		enumerable: false,
		value: this
	});
	Object.defineProperty(ret, "__path", {
		enumerable: false,
		value: path
	});
	if(value && typeof value == "object") {
		this.observeChildren(value, path);
	}
	return ret;
};

DeepObservable.prototype.observeChildren = function(value, path){
	var $this = this;
	Object.keys(value).forEach(function(key){
		var currentPath = path.concat(key);
		var childValue = $this.makeChild(value[key], currentPath);
		Object.defineProperty(value, key, {
			enumerable: true,
			get: function(){
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
 * @class
 * @since 0.54.0
 */
function SavedObservable(defaultValue, storage) {
	if(storage.get) {
		var ret = storage.get(defaultValue);
		Observable.call(this, this.handleReturn(ret) ? defaultValue : ret);
	} else {
		Observable.call(this, defaultValue);
	}
	this.internal.storage = storage;
}

SavedObservable.prototype = Object.create(Observable.prototype);

if(typeof Promise == "function") {
	SavedObservable.prototype.handleReturn = function(ret){
		if(ret instanceof Promise) {
			var $this = this;
			ret.then(function(value){
				// do not call this.updateImpl to avoid saving
				Observable.prototype.updateImpl.call($this, value);
			});
			return true;
		} else {
			return false;
		}
	};
} else {
	SavedObservable.prototype.handleReturn = function(){
		return false;
	};
}

SavedObservable.prototype.updateImpl = function(value, type){
	this.internal.storage.set(value);
	Observable.prototype.updateImpl.call(this, value, type);
};

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
}

ObservableArray.prototype = Object.create(Array.prototype);

Object.defineProperty(ObservableArray.prototype, "length", {
	configurable: false,
	enumerable: false,
	writable: true,
	value: 0
});

["copyWithin", "fill", "pop", "push", "reverse", "shift", "sort", "splice", "unshift"].forEach(function(fun){
	if(Array.prototype[fun]) {
		Object.defineProperty(ObservableArray.prototype, fun, {
			enumerable: false,
			value: function(){
				var ret = Array.prototype[fun].apply(this, arguments);
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

Object.keys(Object.getOwnPropertyDescriptors(Date.prototype)).forEach(function(fun){
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
	return value instanceof Observable || value && value.__parentObservable;
};

/**
 * Subscribes to the observables and, optionally, calls the callback with the current value.
 * @returns The new subscription.
 * @since 0.40.0
 */
Sactory.observe = function(value, callback, type, subscribeOnly){
	if(value.__parentObservable) {
		function get() {
			var obj = value.__parentObservable.value;
			value.__path.forEach(function(p){
				obj = obj[p];
			});
			return obj;
		}
		var ret = value.__parentObservable.subscribe(function(){
			callback(get());
		}, type);
		if(!subscribeOnly) callback(get());
		return ret;
	} else {
		var ret = value.subscribe(callback, type);
		if(!subscribeOnly) callback(value.value);
		return ret;
	}
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
 * @since 0.41.0
 */
Sactory.observable = function(value, storage, key){
	if(arguments.length > 1) {
		if(storage instanceof Storage) {
			return new SavedObservable(value, new StorageObservableProvider(storage, key));
		} else if(typeof storage == "object") {
			return new SavedObservable(value, storage);
		} else if(window.localStorage) {
			return new SavedObservable(value, new StorageObservableProvider(window.localStorage, storage));
		} else {
			console.warn("window.localStorage is unavailable. '" + storage + "' will not be stored.");
		}
	}
	return new Observable(value);
};

/**
 * @since 0.81.0
 */
Sactory.observable.deep = function(value, storage, key){
	return new DeepObservable(value);
};

/**
 * @since 0.81.0
 */
Sactory.computedObservableImpl = function(T, context, bind, observables, fun){
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
Sactory.computedObservable = function(context, bind, observables, fun){
	return Sactory.computedObservableImpl(Observable, context, bind, observables, fun);
};

/**
 * @since 0.81.0
 */
Sactory.computedObservable.deep = function(context, bind, observables, fun){
	return Sactory.computedObservableImpl(DeepObservable, context, bind, observables, fun);
};

module.exports = Sactory;
