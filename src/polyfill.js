var Polyfill = {};
	
Polyfill.startsWith = String.prototype.startsWith || function(search, pos) {
	pos = !pos || pos < 0 ? 0 : +pos;
	return this.substring(pos, pos + search.length) === search;
};

Polyfill.endsWith = String.prototype.endsWith || function(search, this_len) {
	if(this_len === undefined || this_len > this.length) this_len = this.length;
	return this.substring(this_len - search.length, this_len) === search;
};

module.exports = Polyfill;
