// init global variables
require("../dom");

var Builder = require("./builder");

Builder.prototype.event = function(context, name, value, bind){
	this.element.ownerDocument.addEventListener(this.element, name, value);
};

Object.defineProperty(Node.prototype, "__builder", {
	configurable: true,
	get() {
		var value = new Builder(this);
		Object.defineProperty(this, "__builder", {value});
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

module.exports = Sactory;
