var SactoryWidget = require("./widget");

var Sactory = {};

Sactory.widgets = {};

function add(name, value) {
	Object.defineProperty(Sactory.widgets, name, {value});
	SactoryWidget.addWidget(name, value);
}

/**
 * @since 0.134.0
 */
function documentFragment(arg0, arg1, {document = document}) {
	return document.createDocumentFragment();
}

/**
 * @since 0.134.0
 */
function shadowRoot({mode = "open"}, arg1, {element, registry, document = document}) {
	if(!element) {
		element = document.createElement("div");
	}
	registry.add(null, "", element.attachShadow({mode}));
	return element;
}

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

add("document-fragment", documentFragment, false);
add("shadow-root", shadowRoot, false);
add("text", text, false);
add("html", html, false);
add("class", className, false);
