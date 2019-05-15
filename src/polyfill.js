var Polyfill = {};
	
Polyfill.startsWith = String.prototype.startsWith || function(search, pos) {
	pos = !pos || pos < 0 ? 0 : +pos;
	return this.substring(pos, pos + search.length) === search;
};

Polyfill.endsWith = String.prototype.endsWith || function(search, this_len) {
	if(this_len === undefined || this_len > this.length) this_len = this.length;
	return this.substring(this_len - search.length, this_len) === search;
};

Polyfill.trimStart = String.prototype.trimStart || function(){
	return this.replace(/^[\s\uFEFF\xA0]+/g);
};

Polyfill.trimEnd = String.prototype.trimEnd || function(){
	return this.replace(/[\s\uFEFF\xA0]+$/g);
};

Polyfill.padStart = String.prototype.padStart || function(target, string){
	var ret = String(this);
	while(ret.length < target) ret = string + ret;
	return ret;
};

Polyfill.assign = Object.assign || function(target, source){
	for(var key in source) {
		target[key] = source[key];
	}
	return target;
};

module.exports = Polyfill;
