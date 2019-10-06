var SactoryContext = require("./context");
var SactoryConst = require("./const");
var counter = require("./counter");
var SactoryObservable = require("./observable");

var Sactory = {};

/**
 * @class
 * @since 0.45.0
 */
function Bind(parent, createdBy) {
	this.id = counter.nextBind();
	this.parent = parent;
	this.createdBy = createdBy;
	this.children = [];
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
};

/**
 * @since 0.45.0
 */
Bind.prototype.rollback = function(){
	if(this.elements.length) {
		this.elements.forEach(element => {
			if(element.parentNode && (!element["~builderInstance"] || !element["~builder"].events.remove
				|| !element["~builder"].dispatchEvent("remove", {cancelable: true}).defaultPrevented)) {
				element.parentNode.removeChild(element);
			}
		});
		this.elements = [];
	}
	if(this.rollbacks.length) {
		this.rollbacks.forEach(rollback => {
			rollback();
		});
		this.rollbacks = [];
	}
	if(this.children.length) {
		this.children.forEach(child => {
			child.rollback();
		});
		this.children = [];
	}
};

/**
 * @since 0.45.0
 */
Bind.prototype.subscribe = function(subscription){
	this.addRollback(() => {
		subscription.dispose();
	});
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

const factory = new Bind(null, Sactory);

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
	const { element, bind, anchor } = context;
	const ret = (context.document || document).createComment(SactoryObservable.isObservable(value) ? (() => {
		value.subscribe(context, value => ret.textContent = value);
		return value.value;
	})() : value);
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
Sactory.bindFlow = function(context, computed){
	const observable = SactoryObservable.coff(context, computed);
	const currentBind = (context.bind || factory).fork("bind");
	const currentAnchor = context.element && Sactory.anchor(context);
	const reload = fun => fun(SactoryContext.newBindContext(context, currentBind, currentAnchor));
	/* debug:
	if(currentAnchor) {
		currentAnchor.bind = currentBind;
		currentAnchor.textContent = " bind ";
	}
	*/
	observable.subscribe(context, fun => {
		currentBind.rollback();
		reload(fun);
	});
	reload(observable.value);
};

/**
 * @since 0.102.0
 */
Sactory.bindFlowIfElse = function(context, computed, ...functions){
	const index = SactoryObservable.coff(context, computed);
	const currentBind = (context.bind || factory).fork("bindIfElse");
	const currentAnchor = context.element && Sactory.anchor(context);
	const reload = index => {
		if(index != -1) {
			functions[index](SactoryContext.newBindContext(context, currentBind, currentAnchor));
		}
	};
	index.subscribe(context, index => {
		currentBind.rollback();
		reload(index);
	});
	reload(index.value);
};

/**
 * @since 0.102.0
 */
Sactory.bindFlowEach = function(context, target, fun){
	var currentBind = (context.bind || factory).fork("bindEach");
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
	function add(action, bind, anchor, value, index, array) {
		if(bind.anchor = anchor) bind.appendChild(anchor);
		fun(SactoryContext.newBindContext(context, bind, anchor), value, index, array);
		binds[action](bind);
	}
	function remove(bind) {
		bind.rollback();
	}
	var makeAnchor = anchor => (context.element ? Sactory.anchor({element: context.element, anchor}) : null);
	function updateAll() {
		target.value.forEach((value, index, array) => {
			add("push", new Bind(currentBind, "bindEach." + index), makeAnchor(lastAnchor), value, index, array);
		});
	}
	target.subscribe({bind: currentBind}, (array, _, type, data) => {
		switch(type) {
			case SactoryConst.OUT_ARRAY_SET:
				var [index, value] = data;
				var ptr = binds[index];
				if(ptr) {
					// replace
					if(ptr.anchor) {
						// shift the anchor so it will not be removed from the DOM
						ptr.elements.shift();
					}
					ptr.rollback();
					if(ptr.anchor) {
						// put it back
						ptr.appendChild(ptr.anchor);
					}
					fun(SactoryContext.newBindContext(context, ptr, ptr.anchor), value, index, array);
				} else {
					//TODO
				}
				break;
			case SactoryConst.OUT_ARRAY_PUSH:
				Array.prototype.forEach.call(data, (value, i) => {
					add("push", new Bind(currentBind), makeAnchor(lastAnchor),
						value, array.length - data.length + i, array);
				});
				break;
			case SactoryConst.OUT_ARRAY_POP:
				var popped = binds.pop();
				if(popped) remove(popped);
				break;
			case SactoryConst.OUT_ARRAY_UNSHIFT:
				Array.prototype.forEach.call(data, value => {
					add("unshift", new Bind(currentBind, "bindEach.unshift"),
						makeAnchor(firstAnchor.nextSibling), value, 0, array);
				});
				break;
			case SactoryConst.OUT_ARRAY_SHIFT:
				var shifted = binds.shift();
				if(shifted) remove(shifted);
				break;
			case SactoryConst.OUT_ARRAY_SPLICE:
				// insert new elements then call splice on binds and rollback
				var startIndex = data[0];
				var endIndex = startIndex + (data[1] || 0) - 1;
				var ref = binds[endIndex];
				var anchorTo = ref && ref.anchor && ref.anchor.nextSibling || lastAnchor;
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
						bind.anchor = makeAnchor(anchorTo);
						bind.appendChild(bind.anchor);
					}
					fun(SactoryContext.newBindContext(context, bind, bind.anchor), bind.value, i + startIndex, array);
				});
				break;
			default:
				binds.forEach(remove);
				binds.length = 0;
				updateAll();
		}
	});
	updateAll();
};

/**
 * @since 0.145.0
 */
Sactory.bindTo = function(context, dependencies, fun){
	const currentBind = (context.bind || factory).fork("bindTo");
	const currentAnchor = context.element && Sactory.anchor(context);
	const reload = () => fun(SactoryContext.newBindContext(context, currentBind, currentAnchor), dependencies);
	dependencies.forEach(dependency => dependency.subscribe(context, () => {
		currentBind.rollback();
		reload();
	}));
	reload();
};

/**
 * @since 0.131.0
 */
Sactory.unbindTo = function(context, dependencies, fun){
	fun(SactoryContext.newContext(context, {top: false, bind: undefined}));
};

var bindImpl = impl => {
	return (context, dependencies, fun) => {
		if(typeof dependencies == "function") {
			fun = dependencies;
			dependencies = [];
		} else if(!Array.isArray(dependencies)) {
			dependencies = [dependencies];
		}
		impl(context, dependencies, fun);
	};
};

/**
 * @since 0.131.0
 */
Sactory.$$bind = bindImpl(Sactory.bindTo);

/**
 * @since 0.131.0
 */
Sactory.$$unbind = bindImpl(Sactory.unbindTo);

/**
 * @since 0.130.0
 */
Sactory.$$rollback = function(context, callback){
	if(context.bind) context.bind.addRollback(callback);
};

module.exports = Sactory;
