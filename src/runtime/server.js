var jsdom = require("jsdom");
var Builder = require("./builder");
var Factory = require("./common");

var JSDOM = jsdom.JSDOM;

var dom = new JSDOM("");
global.window = dom.window;
global.document = dom.window.document;

Object.defineProperty(window.Element.prototype, "__builder", {
	get: function(){
		return this.__builderInstance || (this.__builderInstance = new Builder(this));
	}
});

module.exports = {
	
	createDocument: function(){
		var ret = Factory.createElement("div", []);
		ret.toString = function(){
			return "<!DOCTYPE html>" + ret.innerHTML;
		};
		return ret;
	}
	
};
