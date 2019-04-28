var Factory = {};

Factory.APP_NAME = "Factory";

Factory.VERSION_MAJOR = 0;
Factory.VERSION_MINOR = 35;
Factory.VERSION_PATCH = 0;
Factory.VERSION = [Factory.VERSION_MAJOR, Factory.VERSION_MINOR, Factory.VERSION_PATCH].join('.');

function hash(str) {
	var hash = 0;
	for(var i=0; i<str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash &= hash;
	}
	return hash;
}

var counts = {};

Factory.nextId = function(namespace){
	if(!counts[namespace]) counts[namespace] = 0;
	return Math.abs(hash(namespace || "")) % 777777 + counts[namespace]++;
};

Factory.reset = function(namespace){
	counts[namespace] = 0;
};

module.exports = Factory;
