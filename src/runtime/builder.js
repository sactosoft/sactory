var Polyfill = require("../polyfill");
var SactoryObservable = require("./observable");
var SactoryBind = require("./bind");

/**
 * @class
 */
function Builder(element) {
	this.element = element;
	this.bind = SactoryBind.bindFactory.create();
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
	if(SactoryObservable.isObservable(value)) {
		this.subscribe(SactoryObservable.observe(value, function(value){
			propImpl(name, value);
		}));
	} else {
		propImpl(name, value);
	}
};

/**
 * @since 0.46.0
 */
Builder.prototype.twoway = function(name, value){
	if(["value", "checked"].indexOf(name) == -1) throw new Error("Cannot two-way bind property '" + name + "'.");
	if(!SactoryObservable.isOwnObservable(value)) throw new Error("Cannot two-way bind property '" + name + "': the given value is not an observable.");
	this.element.addEventListener("input", function(){
		value.value = this[name];
	});
	this.prop(name, value);
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
	if(SactoryObservable.isObservable(value)) {
		this.subscribe(SactoryObservable.observe(value, function(value){
			attrImpl(name, value);
		}));
	} else {
		attrImpl(name, value);
	}
};
	
Builder.prototype.textImpl = function(value){
	var textNode;
	if(SactoryObservable.isObservable(value)) {
		textNode = document.createTextNode("");
		this.subscribe(SactoryObservable.observe(value, function(value){
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
 * @since 0.46.0
 */
Builder.prototype.visibleImpl = function(value, reversed){
	var element = this.element;
	var display = "";
	function update(value) {
		if(!!value ^ reversed) {
			element.style.display = display;
		} else {
			display = element.style.display;
			element.style.display = "none";
		}
	}
	if(SactoryObservable.isObservable(value)) {
		this.subscribe(SactoryObservable.observe(value, update));
	} else {
		update(value);
	}
};

Object.defineProperty(Builder.prototype, "visible", {
	set: function(value){
		this.visibleImpl(value, false);
	}
});

Object.defineProperty(Builder.prototype, "hidden", {
	set: function(value){
		this.visibleImpl(value, true);
	}
});

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
	
Builder.prototype.setImpl = function(name, value){
	switch(name.charAt(0)) {
		case '@':
			name = name.substr(1);
			if(name == "text") {
				this.textImpl(value);
			} else if(name == "visible" || name == "hidden") {
				this.visibleImpl(value, name == "hidden");
			} else {
				this.prop(name, value);
			}
			break;
		case '*':
			this.twoway(name.substr(1), value);
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
				this.event(name, SactoryObservable.unobserve(value));
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
