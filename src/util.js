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

Sactory.nextId = function(namespace, alpha){
	if(!counts[namespace]) counts[namespace] = 0;
	var ret = counts[namespace]++;
	if(alpha) {
		var str = "";
		while(ret >= 0) {
			str += String.fromCharCode(97 + ret % 26);
			ret = Math.floor((ret - 26) / 26);
		}
		return str;
	} else {
		return ret;
	}
};

Sactory.reset = function(namespace){
	counts[namespace] = 0;
};

module.exports = Sactory;
