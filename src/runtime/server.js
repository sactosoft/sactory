// init global variables
require("../dom");

var Builder = require("./builder");

Builder.prototype.eventImpl = function(event, listener, options){
	this.events[event] = true;
	this.element.ownerDocument.addEventListener(this.element, event, listener, options);
};

Object.defineProperty(Node.prototype, "~builder", {
	configurable: true,
	get() {
		var value = new Builder(this);
		Object.defineProperty(this, "~builder", {value});
		return value;
	}
});

var Sactory = {};

/**
 * @since 0.36.0
 */
Sactory.createDocument = function(charset){
	return global.document = new HTMLDocument();
};

/**
 * @since 0.123.0
 */
Sactory.xml = function(namespace, root){
	return new XMLDocument(namespace, root);
};

module.exports = Sactory;
