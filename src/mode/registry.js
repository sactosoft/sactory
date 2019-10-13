const { SourceCodeMode, AutoSourceCodeMode } = require("./sourcecode");
const { HTMLMode, AutoHTMLMode } = require("./html");

const modeRegistry = [];
const modeNames = {};
let defaultMode;

/**
 * @since 0.15.0
 */
function registerMode(parser, isDefault = false) {
	const id = modeRegistry.length;
	modeRegistry.push(parser);
	modeNames[parser.name] = id;
	if(isDefault) defaultMode = id;
	return id;
}

/**
 * @since 0.35.0
 */
function startMode(id, transpiler, parser, result, attributes, parent) {
	const mode = modeRegistry[id];
	const ret = new mode(transpiler, parser, result, attributes || {}, parent);
	ret.name = mode.name;
	ret.options = parser.options = mode.getOptions();
	return ret;
}

/**
 * @since 0.150.0
 */
function getModeByName(name) {
	return Object.prototype.hasOwnProperty.call(modeNames, name) ? modeNames[name] : -1;
}

/**
 * @since 0.150.0
 */
function getModeByTagName(tagName, currentMode) {
	for(let i=0; i<modeRegistry.length; i++) {
		const mode = modeRegistry[i];
		if(mode.matchesTag && mode.matchesTag(tagName, currentMode)) {
			return i;
		}
	}
	return -1;
}

registerMode(SourceCodeMode, true);
registerMode(HTMLMode);
//defineMode(["script"], ScriptMode);
//defineMode(["css"], CSSMode);
//defineMode(["ssb", "style"], SSBMode);
//defineMode(["_comment"], HTMLCommentMode); // private define

// register auto modes after default modes to give less precedence to `matchesTag`

registerMode(AutoSourceCodeMode);
registerMode(AutoHTMLMode);

module.exports = { startMode, getModeByName, getModeByTagName, defaultMode };
