var SactoryWidget = require("./widget");

var Sactory = {};

Sactory.widgets = {};

function add(name, value, register) {
	Object.defineProperty(Sactory.widgets, name, {value});
	if(register) {
		SactoryWidget.addWidget(name, value, false);
	}
}

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

/**
 * @since 0.134.0
 */
function documentFragment(arg0, arg1, context) {
	return (context.document || document).createDocumentFragment();
}

/**
 * @since 0.134.0
 */
function shadowRoot({mode = "open"}, arg1, context) {
	var element = context.element || (context.document || document).createElement("div");
	context.registry.add(null, "", element.attachShadow({mode}));
	return element;
}

/**
 * @since 0.134.0
 */
function xml({namespace, root, name}, arg1, {registry}) {
	var root = xmlImpl(namespace, root || name || "xml");
	registry.add(null, "", root.firstElementChild);
	return root;
}

var xmlImpl = typeof document != "undefined" && document.implementation ?
	(namespace, root) => document.implementation.createDocument(namespace, root) :
	(namespace, root) => new XMLDocument(namespace, root);

/**
 * @since 0.134.0
 */
function text(value, arg1, {element, bind, anchor}) {
	element["~builder"].text(value, bind, anchor);
	return element;
}

/**
 * @since 0.134.0
 */
function html(value, arg1, {element, bind, anchor}) {
	element["~builder"].html(value, bind, anchor);
	return element;
}

/**
 * @since 0.134.0
 */
function className(value, arg1, {element, bind}) {
	element["~builder"].className(value, bind);
}

add("document", Document, false);
add("document-fragment", documentFragment, false);
add("shadow-root", shadowRoot, false);
add("xml", xml, false);
add("text", text, true);
add("html", html, true);
add("class", className, true);
