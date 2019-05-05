var Factory = {};

/**
 * @class
 * @since 0.42.0
 */
function Observable(value) {
	this.internal = {
		value: value,
		count: 0,
		subscriptions: {}
	};
}

Observable.prototype.updateImpl = function(value){
	var oldValue = this.internal.value;
	this.internal.value = value;
	for(var i in this.internal.subscriptions) {
		this.internal.subscriptions[i](value, oldValue);
	}
};

/**
 * @since 0.42.0
 */
Observable.prototype.update = function(value){
	this.updateImpl(arguments.length ? value : this.internal.value);
};

/**
 * @since 0.42.0
 */
Observable.prototype.subscribe = function(callback){
	var id = this.internal.count++;
	var subs = this.internal.subscriptions;
	this.internal.subscriptions[id] = callback;
	return {
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
Factory.isObservable = function(value){
	return Factory.isOwnObservable(value) || Factory.isContainerObservable(value) || Factory.isFunctionObservable(value);
};

/**
 * @since 0.42.0
 */
Factory.isOwnObservable = function(value){
	return value instanceof Observable;
};

/**
 * @since 0.42.0
 */
Factory.isContainerObservable = function(value){
	return value && value.observe && value.compute;
};

/**
 * @since 0.42.0
 */
Factory.isFunctionObservable = function(value){
	return typeof value == "function" && value.subscribe;
};

/**
 * @since 0.40.0
 */
Factory.observe = function(value, callback){
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
 * @since 0.42.0
 */
Factory.unobserve = function(value){
	if(value && value.observe && value.compute) {
		return value.compute();
	} else {
		return value;
	}
};

/**
 * @since 0.41.0
 */
Factory.observable = function(value){
	return new Observable(value);
};

module.exports = Factory;
