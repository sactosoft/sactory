var Polyfill = require("../polyfill");
var Sactory = require("./observable");

var INPUT = ["value", "checked"];

/**
 * @class
 */
function Builder(element) {
	
	this.element = element;
	this.bind = Sactory.bindFactory.create();
	
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
	Array.prototype.push.apply(this.bind.subscriptions, subscriptions);
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
	this.bind.appendChild(textNode);
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
				var builder = this;
				value.split(' ').forEach(function(className){
					builder.addClass(className);
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

// polyfill

if(Object.getOwnPropertyDescriptor(Element.prototype, "classList")) {

	Builder.prototype.addClass = function(className){
		this.element.classList.add(className);
	};

	Builder.prototype.removeClass = function(className){
		this.element.classList.remove(className);
	};

} else {

	Builder.prototype.addClass= function(className){
		if(!this.element.className.split(' ').indexOf(className) != -1) {
			this.element.className = (this.element.className + ' ' + className).trim();
		}
	};

	Builder.prototype.removeClass = function(className){
		this.element.className = this.element.className.split(' ').filter(function(a){
			return a != className;
		}).join(' ');
	};

}

module.exports = Builder;
