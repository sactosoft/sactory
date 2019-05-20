function defineBuilder(Class) {
	Object.defineProperty(Class.prototype, "__builder", {
		configurable: true,
		get: function(){
			var instance = new Builder(this);
			Object.defineProperty(this, "__builder", {
				value: instance
			});
			return instance;
		}
	});
}

defineBuilder(Element);
defineBuilder(DocumentFragment);
defineBuilder(ShadowRoot);
