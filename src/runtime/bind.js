var SactoryContext = require("./context");
var SactoryConst = require("./const");
var SactoryMisc = require("./core");
var SactoryObservable = require("./observable");

var Sactory = {};

/**
 * @class
 * @since 0.45.0
 */
function Bind(parent, createdBy) {
	this.parent = parent;
	this.createdBy = createdBy;
	this.children = [];
	this.subscriptions = [];
	this.elements = [];
	this.rollbacks = [];
}

/**
 * @since 0.45.0
 */
Bind.prototype.fork = function(createdBy){
	var child = new Bind(this, createdBy);
	this.children.push(child);
	return child;
}

/**
 * @since 0.45.0
 */
Bind.prototype.rollback = function(){
	if(this.subscriptions.length) {
		this.subscriptions.forEach(subscription => subscription.dispose());
		this.subscriptions = [];
	}
	if(this.elements.length) {
		this.elements.forEach(element => {
			//if(element["~builder"] && element["~builder"].events.remove && element["~builder"].dispatchEvent("remove", {bubbles: false, cancelable: true}).defaultPrevented) return;
			if(element.parentNode) element.parentNode.removeChild(element);
		});
		this.elements = [];
	}
	if(this.rollbacks.length) {
		this.rollbacks.forEach(fun => fun());
		this.rollbacks = [];
	}
	if(this.children.length) {
		this.children.forEach(child => child.rollback());
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

/**
 * @since 0.64.0
 */
Bind.prototype.addRollback = function(fun){
	this.rollbacks.push(fun);
};

var factory = new Bind(null, Sactory);

/**
 * @since 0.45.0
 */
Object.defineProperty(Sactory, "bindFactory", {
	get: function(){
		return factory;
	}
});

/**
 * @since 0.48.0
 */
Sactory.anchor = function({element, bind, anchor}){
	var ret = document.createTextNode("");
	/* debug:
	ret = document.createComment("");
	*/
	Object.defineProperty(ret, "nodeType", {
		value: Node.ANCHOR_NODE
	});
	Object.defineProperty(ret, "nodeName", {
		value: "#anchor"
	});
	if(anchor) element.insertBefore(ret, anchor);
	else element.appendChild(ret);
	if(bind) bind.appendChild(ret);
	return ret;
};

/**
 * @since 0.124.0
 */
Sactory.comment = function(context, value){
	var { element, bind, anchor } = context;
	var ret = (context.document || document).createComment(SactoryMisc.isBuilderObservable(value) ? (value => {
		var subscription = value.subscribe(value => ret.textContent = value);
		if(bind) bind.subscribe(subscription);
		return value;
	})(value.use(bind)) : value);
	if(element) {
		if(anchor) element.insertBefore(ret, anchor);
		else element.appendChild(ret);
		if(bind) bind.appendChild(ret);
	}
	return ret;
};

/**
 * @since 0.11.0
 */
Sactory.bind = function(context, dependencies, maybeDependencies, fun){
	var currentBind = (context.bind || Sactory.bindFactory).fork("bind");
	var currentAnchor = null;
	var subscribe = !context.bind ? () => {} : subscriptions => context.bind.subscribe(subscriptions);
	var reload = () => fun(SactoryContext.newBindContext(context, currentBind, currentAnchor));
	if(context.element) {
		currentAnchor = Sactory.anchor(context);
		/* debug:
		currentAnchor.bind = currentBind;
		currentAnchor.textContent = " bind ";
		*/
	}
	dependencies.concat(maybeDependencies.filter(SactoryObservable.isObservable)).forEach(dependency => {
		subscribe(dependency.subscribe(() => {
			currentBind.rollback();
			reload();
		}));
	});
	reload();
};

/**
 * @since 0.131.0
 */
Sactory.unbind = function(context, dependencies, maybeDependencies, fun){
	fun(SactoryContext.newContext(context, {top: false, bind: undefined}));
};

var bindImpl = fun => {
	return (context, a, b, c) => {
		if(typeof a == "function") {
			c = a;
			a = b = [];
		} else if(typeof b == "function") {
			c = b;
			b = Array.isArray(a) ? a : [a];
			a = [];
		}
		fun(context, a, b, c);
	};
};

/**
 * @since 0.131.0
 */
Sactory.$$bind = bindImpl(Sactory.bind);

/**
 * @since 0.131.0
 */
Sactory.$$unbind = bindImpl(Sactory.unbind);

/**
 * @since 0.102.0
 */
Sactory.bindIfElse = function(context, conditions, ...functions){
	var currentBindDependencies = (context.bind || Sactory.bindFactory).fork("bindIfElse.dependencies");
	var currentBindContent = (context.bind || Sactory.bindFactory).fork("bindIfElse.content");
	var currentAnchor = context.element && Sactory.anchor(context);
	// filter maybe observables
	conditions.forEach(([, observables, maybe]) => {
		if(maybe) {
			observables.push(...maybe.filter(SactoryObservable.isObservable));
		}
	});
	var active = 0xFEE1DEAD;
	var results;
	var reload = () => {
		// reset results
		results = conditions.map(() => null);
		// calculate new results and call body
		for(var i=0; i<results.length; i++) {
			var [getter] = conditions[i];
			if(!getter || (results[i] = !!getter())) {
				active = i;
				functions[i](SactoryContext.newBindContext(context, currentBindContent, currentAnchor));
				return;
			}
		}
		// no result found
		active = 0xFEE1DEAD;
	};
	var recalc = () => {
		currentBindContent.rollback();
		reload();
	};
	conditions.forEach(([getter, observables], i) => {
		if(observables) {
			observables.forEach(dependency => {
				currentBindDependencies.subscribe(dependency.subscribe(() => {
					if(i <= active) {
						// the change may affect what is being displayed
						var result = !!getter();
						if(result != results[i]) {
							// the condition has changes, need to recalc
							results[i] = result;
							recalc();
						}
					}
				}));
			});
		}
	});
	reload();
};

/**
 * @since 0.102.0
 */
Sactory.bindEach = function(context, target, getter, fun){
	var currentBind = (context.bind || Sactory.bindFactory).fork("bindEach");
	var firstAnchor, lastAnchor;
	if(context.element) {
		firstAnchor = Sactory.anchor(context);
		lastAnchor = Sactory.anchor(context);
		/* debug:
		firstAnchor.textContent = " bind-each:first ";
		lastAnchor.textContent = " bind-each:last ";
		*/
	}
	var binds = currentBind.children; // children are added/removed manually
	var addImpl = (bind, anchor, value, index, array) => {};
	function add(action, bind, anchor, value, index, array) {
		if(bind.anchor = anchor) bind.appendChild(anchor);
		fun(SactoryContext.newBindContext(context, bind, anchor), value, index, array);
		binds[action](bind);
	}
	function remove(bind) {
		bind.rollback();
	}
	function updateAll() {
		getter().forEach((value, index, array) => {
			add("push", new Bind(currentBind, "bindEach." + index), context.element ? Sactory.anchor({element: context.element, anchor: lastAnchor}) : null, value, index, array);
		});
	}
	currentBind.subscribe(target.subscribe((array, _, type, data) => {
		switch(type) {
			case SactoryConst.OUT_ARRAY_SET:
				var [index, value] = data;
				var ptr = binds[index];
				if(ptr) {
					// replace
					if(ptr.anchor) ptr.bind.elements.shift(); // shift the anchor so it will not be removed from the DOM
					ptr.bind.rollback();
					if(ptr.anchor) ptr.bind.appendChild(ptr.anchor);
					fun(SactoryContext.newBindContext(context, ptr, ptr.anchor), value, index, array);
				} else {
					//TODO
				}
				break;
			case SactoryConst.OUT_ARRAY_PUSH:
				Array.prototype.forEach.call(data, (value, i) => {
					add("push", new Bind(currentBind, "bindEach.push"), context.element ? Sactory.anchor({element: context.element, anchor: lastAnchor}) : null, value, array.length - data.length + i, array);
				});
				break;
			case SactoryConst.OUT_ARRAY_POP:
				var popped = binds.pop();
				if(popped) remove(popped);
				break;
			case SactoryConst.OUT_ARRAY_UNSHIFT:
				Array.prototype.forEach.call(data, value => {
					add("unshift", new Bind(currentBind, "bindEach.unshift"), context.element ? Sactory.anchor({element: context.element, anchor: firstAnchor.nextSibling}) : null, value, 0, array);
				});
				break;
			case SactoryConst.OUT_ARRAY_SHIFT:
				var shifted = binds.shift();
				if(shifted) remove(shifted);
				break;
			case SactoryConst.OUT_ARRAY_SPLICE:
				// insert new elements then call splice on binds and rollback
				var index = data[0] + (data[1] || 0) - 1;
				var ptr = binds[index];
				var anchorTo = ptr && ptr.anchor && ptr.anchor.nextSibling || lastAnchor;
				var args = Array.prototype.slice.call(data, 2).map(value => {
					var ret = new Bind(currentBind, "bindEach.splice");
					ret.value = value;
					return ret;
				});
				binds.splice(data[0], data[1], ...args).forEach(removed => {
					removed.rollback();
				});
				args.forEach((bind, i) => {
					if(anchorTo) {
						bind.anchor = Sactory.anchor({element: context.element, anchor: anchorTo});
						bind.appendChild(bind.anchor);
					}
					fun(SactoryContext.newBindContext(context, bind, bind.anchor), bind.value, i + index, array);
				});
				break;
			default:
				binds.forEach(remove);
				binds.length = 0;
				updateAll();
		}
	}));
	updateAll();
};

/**
 * @since 0.102.0
 */
Sactory.bindEachMaybe = function(context, target, getter, fun){
	if(SactoryObservable.isObservable(target)) {
		Sactory.bindEach(context, target, getter, fun);
	} else {
		SactoryMisc.forEachArray(scope, getter(), (...args) => fun(context, ...args));
	}
};

/**
 * @since 0.130.0
 */
Sactory.$$rollback = function(context, callback){
	if(context.bind) context.bind.addRollback(callback);
};

module.exports = Sactory;
