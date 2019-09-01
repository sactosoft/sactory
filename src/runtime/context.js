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
 * Gets the right context from the arguments and the passed context.
 * This works by assuming that everything that gets its context from the arguments
 * is located at the script's top level and not nested into some other bind context,
 * thus leaving the arguments with an higher priority.
 * @since 0.128.0
 */
Sactory.context = function(context1, context2){
	for(var i=0; i<context1.length; i++) {
		var curr = context1[i];
		if(curr && curr.__priority > context2.__priority) {
			return curr;
		}
	}
	return context2;
};

/**
 * Creates a new context by merging the current context and a new context.
 * The priority is also increased.
 * @since 0.128.0
 */
Sactory.newContext = function(context, newContext){
	return Polyfill.assign({}, context, newContext);
};

/**
 * Creates a new context from scratch, using {@link context} to get the
 * right context, suitable to be used in chaining.
 * @since 0.128.0
 */
Sactory.newChainContext = function(context = {}){
	return (({__priority, counter, element, bind, anchor, registry, selector}) => ({
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
