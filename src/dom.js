var entities = require("./json/entities.json");

var selfClosing = /^(area|base|br|col|command|embed|hr|img|input|keygen|link|meta|param|source|track|wbr)$/i;

class Node {

	static get ELEMENT_NODE() {
		return 1;
	}

	static get TEXT_NODE() {
		return 3;
	}

	static get COMMENT_NODE() {
		return 8;
	}

}

function appendImpl(child) {
	if(child.parentNode) child.parentNode.removeChild(child);
	child.parentNode = this;
	return child;
}

class Document extends Node {

	constructor(ownerDocument) {
		super();
		this.ownerDocument = ownerDocument;
		this.parentNode = null;
		this.childNodes = [];
	}

	get children() {
		return this.childNodes.filter(a => a.nodeType == Node.ELEMENT_NODE);
	}

	get firstChild() {
		return this.childNodes[0] || null;
	}

	get firstElementChild() {
		return this.childNodes.find(a => a.nodeType == Node.ELEMENT_NODE) || null;
	}

	get lastChild() {
		return this.childNodes[this.childNodes.length - 1] || null;
	}

	get lastElementChild() {
		return this.childNodes.reverse().find(a => a.nodeType == Node.ELEMENT_NODE) || null;
	}

	get previousSibling() {
		return this.parentNode && this.parentNode.childNodes[this.parentNode.childNodes.findIndex(a => a === this) - 1] || null;
	}

	get previousElementSibling() {
		var children = this.parentNode && this.parentNode.children;
		return children && children[children.findIndex(a => a === this) - 1] || null;
	}

	get nextSibling() {
		return this.parentNode && this.parentNode.childNodes[this.parentNode.childNodes.findIndex(a => a === this) + 1] || null;
	}

	get nextElementSibling() {
		var children = this.parentNode && this.parentNode.children;
		return children && children[children.findIndex(a => a === this) + 1] || null;
	}

	appendChild(child) {
		this.childNodes.push(child);
		return appendImpl.call(this, child);
	}

	insertBefore(newNode, referenceNode) {
		if(!referenceNode) return this.appendChild(newNode);
		for(var i=0; i<this.childNodes.length; i++) {
			if(this.childNodes[i] === referenceNode) {
				this.childNodes.splice(i, 0, newNode);
				return appendImpl.call(this, newNode);
			}
		}
		throw new Error("The node before which the new node is to be inserted is not a child of this node.");
	}

	removeChild(child) {
		var index = this.childNodes.findIndex(a => a === child);
		if(index == -1) throw new Error("The node to be removed is not a child of this node.");
		this.childNodes.splice(index, 1);
		child.parentNode = null;
	}

	remove() {
		this.parentNode.removeChild(this);
	}

	cloneNode(deep) {
		var node = new Document();
		if(deep) this.childNodes.forEach(a => node.appendChild(a.cloneNode(true)));
		return node;
	}

	createElement(tagName) {
		return new Element(tagName.toLowerCase(), this.ownerDocument);
	}

	createTextNode(data) {
		return new Text(data, this.ownerDocument);
	}

	createComment(data) {
		return new Comment(data, this.ownerDocument);
	}

	getElementById(value) {
		var ret = null;
		this.childNodes.find(a => a.nodeType == Node.ELEMENT_NODE && (ret = (a.id == value && a || a.getElementById(value))));
		return ret;
	}

	getElementsByClassName(value) {
		var ret = [];
		this.children.forEach(a => {
			if(a.className.split(" ").includes(value)) ret.push(a);
			Array.prototype.push.apply(ret, a.getElementsByClassName(value));
		});
		return ret;
	}

	getElementsByTagName(value) {
		var ret = [];
		this.children.forEach(a => {
			if(a.tagName == value) ret.push(a);
			Array.prototype.push.apply(ret, a.getElementsByTagName(value));
		});
		return ret;
	}

	querySelector(value) {
		return null;
	}

	querySelectorAll(value) {
		var selectors = [];
		var current;
		function create(inheritance) {
			var created = {
				tagName: null,
				id: null,
				classes: [],
				attributes: {},
				children: [],
				direct: []
			};
			if(inheritance === true) current.direct.push(created);
			else if(inheritance === false) current.children.push(created);
			else selectors.push(created);
			current = created;
		}
		create();
		value.replace(/(?:(\*)|(?:\[([a-zA-Z0-9_-]+)(=(["'])((?:[^\3\\]|\\.)*?)\3)?\])|(?:(#|\.)?([a-zA-Z0-9_-]+)))((?:\s*(>|,)\s*)|\s+)?/g, (_, all, attr, hasValue, quote, value, type, name, inheritance, itype) => {
			if(!all) {
				if(attr) current.attributes[attr] = hasValue ? value.replace(new RegExp("\\\\" + quote, "g"), quote) : null;
				else if(type == '#') current.id = name;
				else if(type == '.') current.classes.push(name);
				else current.tagName = name;
			}
			if(inheritance) {
				if(itype == ',') create()
				else if(itype == '>') create(true);
				else create(false);
			}
		});
		console.log(JSON.stringify(selectors, null, 2));
		//TODO use generated selectors the select real nodes
		return [];
	}

	render() {
		return null;
	}

}

class HTMLDocument extends Document {

	constructor() {
		super();
		this.ownerDocument = this;
		this.documentElement = this.appendChild(this.createElement("html"));
		this.head = this.documentElement.appendChild(this.createElement("head"));
		this.body = this.documentElement.appendChild(this.createElement("body"));
		this.characterSetElement = this.head.appendChild(this.createElement("meta"));
		this.titleElement = null;
		this.scriptElement = null;
		this.scriptElementAnchor = this.head.appendChild(this.createTextNode(""));
		this.eventsElement = null;
		this.characterSet = "UTF-8";
		this.events = [];
	}

	get characterSet() {
		return this.characterSetElement.getAttribute("charset");
	}

	set characterSet(value) {
		this.characterSetElement.setAttribute("charset", value);
	}

	get title() {
		return this.titleElement ? this.titleElement.textContent : "";
	}

	set title(value) {
		if(!this.titleElement) this.titleElement = this.head.appendChild(this.createElement("title"));
		this.titleElement.textContent = value;
	}

	addEventListener(element, type, value) {
		if(!element.sactoryClassName) {
			element.__builder.addClass(element.sactoryClassName = "sa" + element.__builder.runtimeId);
		}
		this.events.push({element, type, value: value + ""});
	}

	render() {
		if(this.events.length) {
			if(!this.scriptElement) {
				this.scriptElement = this.head.insertBefore(this.createElement("script"), this.scriptElementAnchor);
				this.scriptElement.setAttribute("src", "/dist/sactory.min.js");
			}
			if(!this.eventsElement) {
				this.eventsElement = this.head.appendChild(this.createElement("script"));
			} else {
				this.eventsElement.textContent = "";
			}
			var text = "Sactory.ready(function(){";
			this.events.forEach(event => {
				text += "Sactory.on(window, document.querySelector(\"." + event.element.sactoryClassName + "\"), null, " + JSON.stringify(event.type) + ", " + event.value + ");";
			});
			this.eventsElement.textContent = text + "});";
		}
		return "<!DOCTYPE html>" + this.childNodes.map(a => a.render()).join("");
	}

}

function hyphenate(value) {
	var ret = "";
	for(var i=0; i<value.length; i++) {
		var code = value.charCodeAt(i);
		if(code >= 65 && code <= 90) {
			ret += '-';
			ret += String.fromCharCode(code + 32);
		} else {
			ret += value.charAt(i);
		}
	}
	return ret;
}

function dehyphenate(value) {
	var ret = "";
	for(var i=0; i<value.length; i++) {
		if(value.charAt(i) == '-') {
			var code = value.charCodeAt(i++);
			if(code >= 97 && code <= 122) {
				ret += String.fromCharCode(code - 32);
			}
		} else {
			ret += value.charAt(i);
		}
	}
	return ret;
}

function createDataProxy(element) {

	return new Proxy(element, {
		get(obj, prop) {
			return element.getAttribute("data-" + dehyphenate(prop)) || undefined;
		},
		set(obj, prop, value) {
			element.setAttribute("data-" + hyphenate(prop), value);
		}
	});

}

function createStyleProxy(element) {

	function generateMap() {
		var ret = {};
		(element.getAttribute("style") || "").split(';').forEach(a => {
			var i = a.indexOf(':');
			if(i != -1) ret[a.substring(0, i)] = a.substr(i + 1);
		});
		return ret;
	}

	return new Proxy(element, {
		get(obj, prop) {
			return generateMap()[dehyphenate(prop)] || "";
		},
		set(obj, prop, value) {
			var map = generateMap();
			if(value) map[hyphenate(prop)] = value;
			else delete map[hyphenate(prop)];
			var style = "";
			for(var key in map) {
				style += key + ':' + map[key] + ';';
			}
			element.setAttribute("style", style);
		}
	});

}

function lazy(obj, prop, fun) {
	Object.defineProperty(obj, prop, {
		configurable: true,
		get() {
			var instance = fun(obj);
			Object.defineProperty(obj, prop, {
				get() {
					return instance;
				}
			});
			return instance;
		}
	});
}

class Element extends Document {

	constructor(tagName, ownerDocument) {
		super(ownerDocument);
		this.tagName = tagName;
		this.attributes = {};
		lazy(this, "dataset", createDataProxy);
		lazy(this, "style", createStyleProxy);
	}

	get nodeType() {
		return Node.ELEMENT_NODE;
	}

	cloneNode(deep) {
		var node = new Element(this.tagName, this.ownerDocument);
		for(var key in this.attributes) node.attributes[key] = this.attributes[key];
		if(deep) this.childNodes.forEach(a => node.appendChild(a.cloneNode(true)));
		return node;
	}

	get textContent() {
		return this.childNodes.filter(a => a.nodeType != Node.COMMENT_NODE).map(a => a.textContent).join("");
	}

	set textContent(data) {
		this.childNodes.forEach(a => a.parentNode = null);
		this.childNodes = [];
		if(data) this.appendChild(this.createTextNode(data));
	}

	get innerText() {
		return this.textContent;
	}

	set innerText(data) {
		this.textContent = data;
	}

	get innerHTML() {
		return this.childNodes.map(child => child.render()).join("");
	}

	set innerHTML(data) {
		//TODO
	}

	get outerHTML() {
		return this.render();
	}

	set outerHTML(data) {
		//TODO
	}

	getAttribute(name) {
		var ret = this.attributes[name];
		return ret === undefined ? null : ret;
	}

	setAttribute(name, value) {
		this.attributes[name] = value + "";
	}

	removeAttribute(name) {
		delete this.attributes[name];
	}

	get id() {
		return this.getAttribute("id") || "";
	}

	set id(value) {
		this.setAttribute("id", value);
	}

	get className() {
		return this.getAttribute("class") || "";
	}

	set className(value) {
		return this.setAttribute("class", value);
	}

	get checked() {
		return this.getAttribute("checked") !== null;
	}

	set checked(value) {
		if(value) this.setAttribute("checked", "");
		else this.removeAttribute("checked");
	}

	get disabled() {
		return this.getAttribute("disabled") !== null;
	}

	set disabled(value) {
		if(value) this.setAttribute("disabled", "");
		else this.removeAttribute("disabled");
	}

	get type() {
		return this.getAttribute("type") || "text";
	}

	set type(value) {
		this.setAttribute("type", value);
	}

	get value() {
		return this.getAttribute("value") || "";
	}

	set value(value) {
		this.setAttribute("value", value);
	}

	addEventListener(event, listener, options) {}

	removeEventListener(event, listener, options) {}

	render() {
		var ret = "<" + this.tagName;
		for(var key in this.attributes) {
			var value = this.attributes[key];
			ret += " " + key + (value && "=" + JSON.stringify(value));
		}
		ret += ">";
		if(selfClosing.test(this.tagName)) return ret;
		this.childNodes.forEach(child => ret += child.render());
		return ret + "</" + this.tagName + ">";
	}

}

class Text extends Document {

	constructor(data, ownerDocument) {
		super(ownerDocument);
		this.textContent = data;
	}

	get nodeType() {
		return Node.TEXT_NODE;
	}

	cloneNode(deep) {
		return new Text(this.textContent, this.ownerDocument);
	}

	render() {
		return this.textContent.replace(/[<>]/g, m => ({"<": "&lt;", ">": "&gt;"}[m]));
	}

	static replaceEntities(data) {
		return (data + "").replace(/&(#(x)?)?([a-zA-Z0-9]+);/gm, (_, hash, hex, value) => String.fromCharCode(hash ? (hex ? parseInt(value, 16) : value) : entities[value]));
	}

}

class Comment extends Document {

	constructor(data, ownerDocument) {
		super(ownerDocument);
		this.textContent = data;
	}

	get nodeType() {
		return Node.COMMENT_NODE;
	}

	cloneNode(deep) {
		return new Comment(this.textContent, this.ownerDocument);
	}

	render() {
		return "<!--" + this.textContent + "-->";
	}

}

// export to the global scope

global.Node = Node;
global.Document = Document;
global.HTMLDocument = HTMLDocument;
global.Element = Element;
global.Text = Text;
global.Comment = Comment;
