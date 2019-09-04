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

/**
 * @class
 * @since 0.134.0
 */
function Document() {}

Document.prototype = Object.create(SactoryWidget.Widget.prototype);

Document.prototype.render = function({charset}){
	return global.document = new HTMLDocument();
};

Document.prototype.render$head = function(){
	return this.element.head;
};

Document.prototype.render$body = function(){
	return this.element.body;
};

Object.defineProperty(Sactory.widgets, "document", {value: Document});

module.exports = Sactory;
