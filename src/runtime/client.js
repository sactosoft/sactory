function defineBuilder(Class) {
	Object.defineProperty(Class.prototype, "~builder", {
		configurable: true,
		get() {
			var value = new Sactory(this);
			Object.defineProperty(this, "~builder", {value});
			return value;
		}
	});
}

defineBuilder(Window);
defineBuilder(Document);
defineBuilder(Element);
defineBuilder(DocumentFragment);
if(typeof ShadowRoot == "function") defineBuilder(ShadowRoot);

EventTarget.prototype.$$on = function(context, name, value){
	Sactory.$$on(context, this, name, value);
};

/**
 * @since 0.123.0
 */
Sactory.xml = function(namespace, root){
	return document.implementation.createDocument(namespace, root);
};
