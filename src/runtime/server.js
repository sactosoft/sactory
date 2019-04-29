var jsdom = require("jsdom");
var Builder = require("./builder");
var Factory = require("./common");

require("../document"); // init global variables

Object.defineProperty(window.Element.prototype, "__builder", {
	get: function(){
		return this.__builderInstance || (this.__builderInstance = new Builder(this));
	}
});

module.exports = {
	
	createDocument: function(){
		var dom = new jsdom.JSDOM("");
		global.window = dom.window;
		var ret = global.document = dom.window.document;
		ret.toString = function(){
			return dom.serialize();
		};
		return ret;
	}
	
};
