Object.defineProperty(Element.prototype, "__builder", {
	get: function(){
		return this.__builderInstance || (this.__builderInstance = new Builder(this));
	}
});
