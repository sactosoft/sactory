var Sactory = {};

/**
 * @class
 * @since 0.42.0
 */
function Observable(value) {
	this.internal = {
		value: value,
		snaps: {},
		count: 0,
		subscriptions: {}
	};
}

Observable.prototype.updateImpl = function(value, type){
	var oldValue = this.internal.value;
	this.internal.value = value;
	for(var i in this.internal.subscriptions) {
		this.internal.subscriptions[i](value, oldValue, type);
	}
};

/**
 * @since 0.42.0
 */
Observable.prototype.update = function(value, type){
	this.updateImpl(arguments.length ? value : this.internal.value, type);
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
Observable.prototype.subscribe = function(callback){
	var id = this.internal.count++;
	var subs = this.internal.subscriptions;
	this.internal.subscriptions[id] = callback;
	return {
		to: this,
		dispose: function(){
			delete subs[id];
		}
	};
};

Observable.prototype.toJSON = function(){
	return this.internal.value;
};

/**
 * @since 0.42.0
 */
Object.defineProperty(Observable.prototype, "value", {
	get: function(){
		return this.internal.value;
	},
	set: function(value){
		this.updateImpl(value);
	}
});

/**
 * @since 0.40.0
 */
Sactory.isObservable = function(value){
	return Sactory.isOwnObservable(value) || Sactory.isContainerObservable(value) || Sactory.isFunctionObservable(value);
};

/**
 * @since 0.42.0
 */
Sactory.isOwnObservable = function(value){
	return value instanceof Observable;
};

/**
 * @since 0.42.0
 */
Sactory.isContainerObservable = function(value){
	return value && value.observe && value.compute;
};

/**
 * @since 0.42.0
 */
Sactory.isFunctionObservable = function(value){
	return typeof value == "function" && value.subscribe;
};

/**
 * Subscribes to the observables and calls the callback with the current value.
 * @returns An array with the new subscriptions.
 * @since 0.40.0
 */
Sactory.observe = function(value, callback){
	var subscriptions = [];
	if(value instanceof Observable) {
		subscriptions.push(value.subscribe(callback));
		callback(value.value);
	} else if(value.subscribe) {
		subscriptions.push(value.subscribe(callback));
		callback(value());
	} else {
		function computed() {
			callback(value.compute());
		}
		value.observe.forEach(function(observable){
			subscriptions.push(observable.subscribe(computed));
		});
		computed();
	}
	return subscriptions;
};

/**
 * @deprecated Use {@link computedOf} instead.
 * @since 0.42.0
 */
Sactory.unobserve = function(value){
	if(value && value.observe && value.compute) {
		return value.compute();
	} else {
		return value;
	}
};

/**
 * @since 0.46.0
 */
Sactory.computedOf = function(value){
	if(Sactory.isOwnObservable(value)) return value.value;
	else if(Sactory.isFunctionObservable(value)) return value();
	else if(Sactory.isContainerObservable(value)) return value.compute();
	else return null;
};

/**
 * @since 0.41.0
 */
Sactory.observable = function(value){
	return new Observable(value);
};

/**
 * @since 0.48.0
 */
Sactory.computedObservable = function(bind, value){
	var ret = new Observable(value.compute());
	var subscriptions = [];
	value.observe.forEach(function(o){
		subscriptions.push(o.subscribe(function(){
			ret.value = value.compute();
		}));
	});
	if(bind) subscriptions.forEach(bind.subscribe);
	return ret;
};

module.exports = Sactory;
