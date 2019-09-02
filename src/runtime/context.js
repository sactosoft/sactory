var Polyfill = require("../polyfill");

var Sactory = {};

/**
 * @since 0.132.0
 */
Sactory.getContextFromArguments = Sactory.cfa = function(args){
	for(var i=args.length; i>0; i--) {
		var arg = args[i - 1];
		if(arg && arg.__context) {
			return arg;
		}
	}
};

/**
 * @since 0.132.0
 */
Sactory.getContextFromArgumentsAndContext = Sactory.cfac = function(context, args){
	return Sactory.cfa(args) || context;
};

/**
 * Creates a new context by merging the current context and a new context.
 * The priority is also increased.
 * @since 0.128.0
 */
Sactory.newContext = function(context, newContext){
	return Polyfill.assign({__context: true}, context, newContext);
};

/**
 * Creates a new context from scratch, using {@link context} to get the
 * right context, suitable to be used in chaining.
 * @since 0.128.0
 */
Sactory.newChainContext = function(context){
	return (({counter, element, bind, anchor, registry, selector}) => ({
		__context: true,
		counter, bind, anchor, registry, selector,
		parentElement: element,
		parentAnchor: anchor,
		document: element ? element.ownerDocument : document
	}))(context);
};

/**
 * Gets the preferred element in the given context.
 * @since 0.128.0
 */
Sactory.currentElement = function(context){
	return context.content || context.container || context.element || context.parentElement;
};

module.exports = Sactory;
