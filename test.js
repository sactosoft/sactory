const Transpiler = require("./src/transpiler");
const Result = require("./src/result");

function strImpl(data, html = false) {
	switch(data.type) {
		case Result.SOURCE:
			return data.value;
		case Result.TEXT:
			return data.value; //TODO replace ` and $
		case Result.INTERPOLATED_TEXT:
			return "<!-- ko text: " + str(data.expr, true) + " --><!-- /ko -->";
		case Result.OBSERVABLE:
			return `ko.observable(${str(data.expr)})`;
		case Result.OBSERVABLE_VALUE:
			return str(data.expr) + (html ? (data.peek ? ".peek()" : "()") : ".value");
		case Result.COMPUTED_OBSERVABLE:
			return `ko.computed(${str(data.expr)})`;
		case Result.TAG: {
			let ret = "";
			if(data.level === 0) {
				ret += "$(`";
			}
			ret += "<";
			if(data.computed) {
				ret += `\${${str(data.tagName)}}`;
			} else {
				ret += data.tagName;
			}
			return ret;
		}
		case Result.TAG_END:
			if(data.start.inline) {
				if(data.start.level === 0) {
					return "/>`)[0]";
				} else {
					return "/>";
				}
			} else {
				return ">";
			}
		case Result.TAG_CLOSE: {
			let ret = `</${data.start.tagName}>`;
			if(data.start.level === 0) {
				ret += "`)[0]";
			}
			return ret;
		}
		case Result.ATTRIBUTE: {
			let ret = " ";
			if(data.computed) {
				ret += `\${${str(data.name)}}`;
			} else {
				ret += data.name;
			}
			ret += "=" + str(data.value);
			return ret;
		}
		default:
			console.warn("Mission handler for " + data.type);
	}
}

function str(data) {
	let ret = "";
	data.forEach(d => ret += strImpl(d));
	return ret;
}

const data = new Transpiler().transpile(`const section = <section title="Hello world!" />

let a = &1;

<div class="test" data-is-fucking-epic>
	this is some text
	with interpolation: \${*a}
	<p>and a paragraph</p>
	const value = 1;
</div>

let b = &12;
let c = &55;
console.log(*b + *c);

let d = & => *b + *c;
`);

console.log(str(data));
console.log(Result.countObservables(data));
