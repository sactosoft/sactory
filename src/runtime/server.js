// init global variables
require("../dom");

var Builder = require("./core");
var SactoryWidget = require("./widget");
var Sactory = require("./widgets");

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

/**
 * @since 0.134.0
 */
function document() {
	return new HTMLDocument();
}

Object.defineProperty(Sactory.widgets, "document", {value: document});

module.exports = Sactory;
