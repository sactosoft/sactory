var Polyfill = require("../polyfill");
var SactoryConfig = require("./config");
var SactoryStyle = require("./style");

var Sactory = {};

var animations = {};

Sactory.addAnimation = function(name, value){
	animations[name] = value;
};

Sactory.getAnimation = function(name){
	return animations.hasOwnProperty(name) ? animations[name] : null;
};

Sactory.createKeyframes = function(animation, options){
	var name = SactoryConfig.newPrefix();
	var keyframes = [];
	if(typeof animation == "function") animation = animation(options);
	else {
		// cache keyframes functions for animations that are plain objects
		if(animation.className) return animation.className;
		else animation.className = name;
	}
	if(!options.easing) options.easing = animation.easing;
	if(!options.duration) options.duration = animation.duration;
	for(var i in animation) {
		if(i == "from" || i == "to") {
			var value = [];
			for(var key in animation[i]) {
				value.push({selector: key, value: animation[i][key] + ""});
			}
			keyframes.push({selector: i, value: value});
		}
	}
	var style = document.createElement("style");
	style.textContent = SactoryStyle.compileStyle([{selector: "@keyframes " + name, value: keyframes}]);
	/* debug:
	style.setAttribute(":debug", "animation-keyframes");
	*/
	document.head.appendChild(style);
	return name;
};

module.exports = Sactory;
