// init global variables
require("../dom");

var Builder = require("./core");

Builder.prototype.event = function(name, value){
	this.element.ownerDocument.addEventListener(this.element, name, value);
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

module.exports = Sactory;
