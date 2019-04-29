var Factory = {};

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
