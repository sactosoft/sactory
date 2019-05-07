var Sactory = {};

Sactory.hash = function(str) {
	var hash = 0;
	for(var i=0; i<str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash &= hash;
	}
	return hash;
}

var counts = {};

Sactory.nextId = function(namespace){
	if(!counts[namespace]) counts[namespace] = 0;
	return counts[namespace]++;
};

Sactory.reset = function(namespace){
	counts[namespace] = 0;
};

module.exports = Sactory;
