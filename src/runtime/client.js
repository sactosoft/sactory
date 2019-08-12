function defineBuilder(Class) {
	Object.defineProperty(Class.prototype, "__builder", {
		get: function(){
			return this.__builderInstance || (this.__builderInstance = new Builder(this));
		}
	});
}

defineBuilder(Window);
defineBuilder(Document);
defineBuilder(Element);
defineBuilder(DocumentFragment);
if(typeof ShadowRoot == "function") defineBuilder(ShadowRoot);

/**
 * @since 0.123.0
 */
Sactory.xml = function(namespace, root){
	return document.implementation.createDocument(namespace, root);
};
