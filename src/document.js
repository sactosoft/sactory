var jsdom = require("jsdom");

var dom = new jsdom.JSDOM("");

global.window = dom.window;
global.document = dom.window.document;
