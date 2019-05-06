var Polyfill = require("../polyfill");
var Sactory = require("./observable");

var INPUT = ["value", "checked"];

/**
 * @class
 */
function Builder(element) {
	
	this.element = element;
	
	this.appendChild;
	this.after = {};
	this.recordings = {};
	
	this.subscriptions = [];
	
	var id;
	
	Object.defineProperty(this, "id", {
		get: function(){
			if(id === undefined) id = Math.floor(Math.random() * 1000000);
			return id;
		}
	});
	
}

/**
 * @since 0.42.0
 */
Builder.prototype.subscribe = function(subscriptions){
	Array.prototype.push.apply(this.subscriptions, subscriptions);
};

Builder.prototype.propImpl = function(name, value){
	var o = this.element;
	if(name.charAt(0) == '@') {
		o = o.__component;
		name = name.substr(1);
	}
	var s = name.split('.');
	while(s.length > 1) {
		o = o[s.shift()];
	}
	o[s[0]] = value;
};
	
Builder.prototype.prop = function(name, value){
	var propImpl = this.propImpl.bind(this);
	if(Sactory.isObservable(value)) {
		if(INPUT.indexOf(name) != -1 && Sactory.isOwnObservable(value)) {
			this.element.addEventListener("input", function(){
				value.value = this[name];
			});
		}
		this.subscribe(Sactory.observe(value, function(value){
			propImpl(name, value);
		}));
	} else {
		propImpl(name, value);
	}
};
	
Builder.prototype.attrImpl = function(name, value){
	if(value === undefined || value === null) {
		this.element.removeAttribute(name);
	} else {
		this.element.setAttribute(name, value);
	}
};
	
Builder.prototype.attr = function(name, value){
	var attrImpl = this.attrImpl.bind(this);
	if(Sactory.isObservable(value)) {
		if(INPUT.indexOf(name) != -1) {
			console.warn("Observable value for '" + name + "' should be assigned to a property, not to an attribute.");
		}
		this.subscribe(Sactory.observe(value, function(value){
			attrImpl(name, value);
		}));
	} else {
		attrImpl(name, value);
	}
};
	
Builder.prototype.textImpl = function(value){
	var textNode;
	if(Sactory.isObservable(value)) {
		textNode = document.createTextNode("");
		this.subscribe(Sactory.observe(value, function(value){
			textNode.textContent = value;
		}));
	} else {
		textNode = document.createTextNode(value);
	}
	this.element.appendChild(textNode);
};

Object.defineProperty(Builder.prototype, "text", {
	set: function(value){
		this.textImpl(value);
	}
});

/**
 * @since
 */
Builder.prototype.event = function(name, value){
	var split = name.split(".");
	var event = split.shift();
	var listener;
	var options = {};
	split.forEach(function(mod){
		switch(mod) {
			case "prevent":
				listener = function(event){
					event.preventDefault();
					if(value) value.call(this, event);
				};
				break;
			case "stop":
				listener = function(event){
					event.stopPropagation();
					if(value) value.call(this, event);
				};
				break;
			case "once":
				options.once = true;
				break;
		}
	});
	this.element.addEventListener(event, listener || value, options);
};
	
Builder.prototype.setImpl = function(name, value){
	switch(name.charAt(0)) {
		case '@':
			name = name.substr(1);
			if(name == "text") {
				this.textImpl(value);
			} else {
				this.prop(name, value);
			}
			break;
		case '+':
			name = name.substr(1);
			if(name == "class") {
				var element = this.element;
				value.split(' ').forEach(function(className){
					element.classList.add(className);
				});
			} else if(name == "style") {
				var style = this.element.getAttribute("style");
				if(style) {
					if(!Polyfill.endsWith.call(style, ';')) style += ';';
					style += value;
				} else {
					style = value;
				}
				this.element.setAttribute("style", style);
			} else if(name == "text") {
				this.textImpl(value);
			} else {
				this.event(name, Sactory.unobserve(value));
			}
			break;
		default:
			this.attr(name, value);
	}
};
	
Builder.prototype.set = function(name, value){
	if(typeof name == "object") {
		for(var key in name) {
			this.setImpl(key, name[key]);
		}
	} else {
		this.setImpl(name, value);
	}
	return this.element;
};

/**
 * @since 0.11.0
 */
Builder.prototype.startRecording = function(id){
	if(!this.after[id]) this.after[id] = {sibling: this.element.lastChild};
	this.appendChild = this.element.appendChild;;
	var sibling = this.after[id].sibling ? this.after[id].sibling.nextSibling : this.element.firstChild;
	this.recordings[id] = [];
	var $this = this;
	this.element.appendChild = function(child){
		$this.recordings[id].push(child);
		this.insertBefore(child, sibling);
		sibling = child.nextSibling;
	};
};

/**
 * @since 0.11.0
 */
Builder.prototype.stopRecording = function(id){
	this.element.appendChild = this.appendChild;
};

/**
 * @since 0.11.0
 */
Builder.prototype.rollback = function(id){
	function unsubscribe(el) {
		if(el.__builderInstance) {
			el.__builder.unsubscribe();
			if(el.__builder.beforeremove) el.__builder.beforeremove.call(el);
		}
		Array.prototype.forEach.call(el.children, unsubscribe);
	}
	var $this = this;
	this.recordings[id].forEach(function(child){
		if(child.nodeType == Node.ELEMENT_NODE) unsubscribe(child);
		$this.element.removeChild(child);
	});
};

/**
 * @since 0.13.0
 */
Builder.prototype.unsubscribe = function(){
	this.subscriptions.forEach(function(subscription){
		subscription.dispose();
	});
};

module.exports = Builder;
