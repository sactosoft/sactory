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

module.exports = Sactory;
