var SactoryConfig = require("./config");

/**
 * @class
 * @since 0.122.0
 */
function Counter(count){
	this.init = this.count = count;
}

/**
 * @since 0.132.0
 */
Counter.prototype.reset = function(){
	this.count = this.init;
};

/**
 * @since 0.122.0
 */
Counter.prototype.nextId = function(){
	return ++this.count;
};

/**
 * @since 0.122.0
 */
Counter.prototype.nextPrefix = function(){
	return SactoryConfig.config.prefix + this.nextId();
};

const counter = new Counter((() => {
	let ret;
	if(typeof document != "undefined" && document.documentElement && document.documentElement.dataset.sactory) {
		ret = +document.documentElement.dataset.sactory;
		document.documentElement.removeAttribute("data-sactory");
	}
	return ret || 0;
})());

module.exports = counter;
