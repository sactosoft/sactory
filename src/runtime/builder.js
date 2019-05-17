var Polyfill = require("../polyfill");
var SactoryObservable = require("./observable");
var SactoryBind = require("./bind");

/**
 * @class
 */
function Builder(element) {

	this.element = element;

	Object.defineProperty(this, "runtimeId", {
		configurable: true,
		get: function(){
			var id = Math.round(Math.random() * 100000);
			Object.defineProperty(this, "runtimeId", {
				get: function(){
					return id;
				}
			});
			return id;
		}
	});

}

/**
 * @since 0.42.0
 */
Builder.prototype.subscribe = function(bind, subscription){
	if(bind) bind.subscriptions.push(subscription);
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
	
Builder.prototype.prop = function(name, value, bind, type){
	var propImpl = this.propImpl.bind(this);
	if(SactoryObservable.isObservable(value)) {
		this.subscribe(bind, SactoryObservable.observe(value, function(value){
			propImpl(name, value);
		}, type));
	} else {
		propImpl(name, value);
	}
};

/**
 * @since 0.46.0
 */
Builder.prototype.twoway = function(name, value, bind){
	if(["value", "checked"].indexOf(name) == -1) throw new Error("Cannot two-way bind property '" + name + "'.");
	if(!SactoryObservable.isObservable(value)) throw new Error("Cannot two-way bind property '" + name + "': the given value is not an observable.");
	var type = 1048576 + Math.floor(Math.random() * 1048576);
	this.element.addEventListener("input", function(){
		value.update(this[name], type);
	});
	this.prop(name, value, bind, type);
};
	
Builder.prototype.attrImpl = function(name, value){
	if(value === undefined || value === null) {
		this.element.removeAttribute(name);
	} else {
		this.element.setAttribute(name, value);
	}
};
	
Builder.prototype.attr = function(name, value, bind){
	var attrImpl = this.attrImpl.bind(this);
	if(SactoryObservable.isObservable(value)) {
		this.subscribe(bind, SactoryObservable.observe(value, function(value){
			attrImpl(name, value);
		}));
	} else {
		attrImpl(name, value);
	}
};
	
Builder.prototype.text = function(value, bind, anchor){
	var textNode;
	var insertBefore = anchor && anchor.parentNode === this.element;
	if(SactoryObservable.isObservable(value)) {
		textNode = document.createTextNode("");
		this.subscribe(bind, SactoryObservable.observe(value, function(value){
			textNode.textContent = value;
			textNode.observed = true;
		}));
	} else {
		var prev = insertBefore ? anchor.previousSibling : this.element.lastChild;
		if(prev && prev.nodeType == Node.TEXT_NODE && !prev.observed) {
			// append to previous text node instead of creating a new one
			prev.textContent += value;
			return;
		}
		textNode = document.createTextNode(value);
	}
	if(insertBefore) this.element.insertBefore(textNode, anchor);
	else this.element.appendChild(textNode);
	if(bind) bind.appendChild(textNode);
};

/**
 * @since 0.46.0
 */
Builder.prototype.visible = function(value, reversed, bind){
	var element = this.element;
	var display = "";
	function update(value) {
		if(!!value ^ reversed) {
			element.style.display = display;
		} else if(element.style.display != "none") {
			display = element.style.display;
			element.style.display = "none";
		}
	}
	if(SactoryObservable.isObservable(value)) {
		this.subscribe(bind, SactoryObservable.observe(value, update));
	} else {
		update(value);
	}
};

/**
 * @since 0.22.0
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
	
Builder.prototype.setImpl = function(name, value, bind, anchor){
	switch(name.charAt(0)) {
		case '@':
			name = name.substr(1);
			if(name == "text") {
				this.text(value, bind, anchor);
			} else if(name == "visible" || name == "hidden") {
				this.visible(value, name == "hidden", bind);
			} else {
				this.prop(name, value, bind);
			}
			break;
		case '*':
			this.twoway(name.substr(1), value, bind);
			break;
		case '+':
			name = name.substr(1);
			if(name == "class") {
				//TODO observable functionalities
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
			} else {
				this.event(name, SactoryObservable.unobserve(value));
			}
			break;
		default:
			this.attr(name, value, bind);
	}
};
	
Builder.prototype.set = function(name, value, bind, anchor){
	if(typeof name == "object") {
		for(var key in name) {
			this.setImpl(key, name[key], bind, anchor);
		}
	} else {
		this.setImpl(name, value, bind, anchor);
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
