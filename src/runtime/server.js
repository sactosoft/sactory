// init global variables
require("../dom");

var Builder = require("./builder");

Object.defineProperty(Node.prototype, "__builder", {
	configurable: true,
	get: function(){
		var instance = new Builder(this);
		Object.defineProperty(this, "__builder", {
			value: instance
		});
		return instance;
	}
});

var Sactory = {};

/**
 * @since 0.36.0
 */
Sactory.createDocument = function(charset){
	var document = global.document = new Document();
	function create(parent, tagName, prop) {
		var element = parent.createElement(tagName);
		Object.defineProperty(document, prop || tagName, {
			get: function(){
				return element;
			}
		});
		return parent.appendChild(element);
	}
	var html = create(document, "html", "documentElement");
	var head = create(html, "head");
	var body = create(html, "body");
	var meta = document.createElement("meta");
	meta.setAttribute("charset", charset || "UTF-8");
	head.appendChild(meta);
	Object.defineProperty(document, "title", {
		get: function(){
			var titles = document.getElementsByTagName("title");
			return titles.length ? titles[0].textContent : "";
		},
		set: function(value){
			var titles = document.getElementsByTagName("title");
			if(titles.length) {
				titles[0].textContent = value;
			} else {
				var title = document.createElement("title");
				title.textContent = value;
				document.head.appendChild(title);
			}
		}
	});
	return document;
};

module.exports = Sactory;
