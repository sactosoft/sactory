const { TranspilerFactory } = require("./src/transpiler");
const { ReaderType } = require("./src/reader");

function strImpl(data, html = false) {
	switch(data.rt) {
		case ReaderType.SOURCE:
			return data.value;
		case ReaderType.TEXT:
			return data.value; //TODO replace ` and $
		case ReaderType.INTERPOLATED_TEXT:
			console.log(data);
			return "<!-- ko text: " + str(data.expr, true) + " --><!-- /ko -->";
		case ReaderType.OBSERVABLE:
			return `ko.observable(${str(data.expr)})`;
		case ReaderType.OBSERVABLE_VALUE:
			return str(data.expr) + (html ? (data.peek ? ".peek()" : "()") : ".value");
		case ReaderType.COMPUTED_OBSERVABLE:
			return `ko.computed(${str(data.expr)})`;
		case ReaderType.TAG: {
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
		case ReaderType.TAG_CLOSE: {
			let ret = `</${data.start.tagName}>`;
			if(data.start.level === 0) {
				ret += "`)[0]";
			}
			return ret;
		}
		case ReaderType.ATTRIBUTE: {
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

const str = data => {
	let ret = "";
	data.forEach(d => ret += strImpl(d));
	return ret;
};

const data = new TranspilerFactory({
	mode: "auto-code:logic",
	observables: {
		supported: true,
		peek: true,
		maybe: true,
		computed: true,
		functionAttributes: []
	},
	tags: {
		computed: true,
		capitalIsWidget: true,
		types: {
			directive: true,
			argumented: true,
			children: true,
			slot: true,
			special: true
		}
	},
	attributes: {
		computed: true,
		interpolated: true,
		spread: true,
		types: {
			directive: true,
			prop: true,
			style: true,
			event: true,
			widget: true,
			updateWidget: true,
			bind: true
		}
	},
	interpolation: {
		text: true,
		html: true,
		value: true,
		string: true,
		custom1: true,
		custom2: true,
		custom3: true
	},
	logic: {
		variables: ["var", "let", "const"],
		statements: ["for"],
		foreach: {
			array: true,
			object: true,
			range: true
		}
	}
}).transpile(`const section = <section title="Hello world!" />

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
