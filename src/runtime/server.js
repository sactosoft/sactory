// init global variables
require("../dom");

var Builder = require("./core");
var counter = require("./counter");
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
function document(arg0, arg1, context) {
	return context.document = new HTMLDocument();
}

/**
 * @since 0.141.0
 */
function app({name = "App", src, runtime = "Sactory"}, arg1, context) {
	const id = counter.nextPrefix();
	const script1 = context.document.createElement("script");
	script1.setAttribute("src", src);
	const script2 = context.document.createElement("script");
	script2.textContent = `window.addEventListener("load",function(){var e=document.querySelector("#${id}");${runtime}.chain({element: e.parentNode, anchor: e.nextSibling}, [${runtime}.chain.create, ${name}, []], [${runtime}.chain.append])})`;
	script2.setAttribute("id", id);
	const fragment = context.document.createDocumentFragment();
	fragment.appendChild(script1);
	fragment.appendChild(script2);
	return fragment;
}

Object.defineProperty(Sactory.widgets, "document", {value: document});
Object.defineProperty(Sactory.widgets, "app", {value: app});

module.exports = Sactory;
