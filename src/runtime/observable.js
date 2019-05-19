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

Observable.Proxy = typeof Proxy == "function" ? Proxy : null;

Observable.prototype.replace = function(value){
	if(value && typeof value == "object" && Observable.Proxy) {
		return new Observable.Proxy(value, new ObservableProxyHandler(this));
	} else {
		return value;
	}
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
 * @since 0.42.0
 */
Observable.prototype.update = function(value, type){
	this.updateImpl(arguments.length ? this.replace(value) : this.internal.value, type);
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
 * @since 0.56.0
 */
function ObservableProxyHandler(observable) {
	this.observable = observable;
}

ObservableProxyHandler.prototype.set = function(object, property, value){
	object[property] = value;
	this.observable.updateImpl(this.observable.internal.value);
	return value;
};

ObservableProxyHandler.prototype.deleteProperty = function(object, property){
	var ret = delete object[property];
	this.observable.updateImpl(this.observable.internal.value);
	return ret;
};

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
 * Subscribes to the observables and calls the callback with the current value.
 * @returns The new subscription.
 * @since 0.40.0
 */
Sactory.observe = function(value, callback, type){
	var ret = value.subscribe(callback, type);
	callback(value.value);
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
 * @since 0.48.0
 */
Sactory.computedObservable = function(context, bind, observables, fun){
	var ret = new Observable(fun.call(context));
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

module.exports = Sactory;
