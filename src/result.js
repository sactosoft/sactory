let id = 0;

const make = (left, right) => {
	return Object.assign(left, right, {id: id++});
};

class Result {
	
	constructor() {
		this.data = [];
	}

	push(type, position, data = {}) {
		this.data.push(make(data, {type, position}));
		return data;
	}

	pushAll(data) {
		this.data.push(...data);
	}

	inject(index, type, position, data = {}) {
		this.data.splice(index, 0, make(data, {type, position}));
		return data;
	}

	get tail() {
		return this.data[this.data.length - 1];
	}

	toString() {
		return JSON.stringify(this.data, null, 4);
	}

	static countObservables(data) {
		let count = 0;
		data.forEach(({type, expr}) => {
			if(type === Result.OBSERVABLE_VALUE) {
				count++;
			}
			if(expr) {
				count += Result.countObservables(expr);
			}
		});
		return count;
	}

}

let c = 0;
[
	"SOURCE",

	// text
	"TEXT",
	"INTERPOLATED_TEXT",
	"INTERPOLATED_HTML",
	"INTERPOLATED_VALUE",
	"INTERPOLATED_STRING",
	"INTERPOLATED_CUSTOM_1",
	"INTERPOLATED_CUSTOM_2",
	"INTERPOLATED_CUSTOM_3",
	"INTERPOLATED_END",

	// observables
	"OBSERVABLE",
	"OBSERVABLE_ARRAY",
	"COMPUTED_OBSERVABLE",
	"OBSERVABLE_VALUE",

	// tags
	"TAG",
	"TAG_DIRECTIVE",
	"TAG_SPECIAL",
	"TAG_SLOT",
	"TAG_END",
	"TAG_CLOSE",

	// attributes
	"ATTRIBUTE",
	"ATTRIBUTE_INTERPOLATED",
	"ATTRIBUTE_SPREAD",

	// attribute type, only used as subtypes
	"ATTRIBUTE_NONE",
	"ATTRIBUTE_PROPERTY",
	"ATTRIBUTE_STYLE",
	"ATTRIBUTE_EVENT",
	"ATTRIBUTE_WIDGET",
	"ATTRIBUTE_UPDATE_WIDGET",
	"ATTRIBUTE_BIND",
	"ATTRIBUTE_DIRECTIVE",

	// xml comments
	"COMMENT",

	// logic mode
	"VARIABLE",
	"STATEMENT_START",
	"STATEMENT_END",
	"FOREACH",

].forEach(type => {
	Object.defineProperty(Result, type, {value: c++});
});

module.exports = Result;
