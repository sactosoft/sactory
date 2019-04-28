var Factory = {};

var templates = {};

/**
 * Defines a new template that can be used to modify a node.
 */
Factory.defineTemplate = function(name, tagName, args, modifier){
	if(typeof tagName == "function") {
		modifier = args;
		args = tagName;
		tagName = null;
	}
	if(typeof args == "function") {
		modifier = args;
		args = [];
	}
	templates[name] = {
		name: name,
		tagName: tagName,
		args: args,
		modifier: modifier
	};
};

Factory.parseTemplates = function(str){
	
	var splitted = str.split('$');
	var selected = [];
	
	splitted.slice(1).forEach(function(templateName){
		var optional = templateName.charAt(0) == '?';
		if(optional) templateName = templateName.substr(1);
		var template = templates[templateName];
		if(template) {
			selected.push(template);
			if(!tagName) tagName = template.tagName;
		} else if(!optional) {
			throw new Error("Template '" + templateName + "' could not be found.")
		}
	});
	
	return {tagName: splitted[0], templates: selected};
	
};

module.exports = Factory;
