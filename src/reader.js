let id = 0;
const make = (left, right) => Object.assign(left, right, {id: ++id});

const ReaderType = {

	/* 
	 * @param string value
	 */
	SOURCE: "Source",
	
	/*
	 * @param string value
	 */
	TEXT: "Text",

	/*
	 * @param string type
	 * @param array expr
	 */
	INTERPOLATED: "Interpolated",

	OBSERVABLE: "Observable",

	COMPUTED_OBSERVABLE: "ComputedObservable",

	OBSERVABLE_VALUE: "ObservableValue",

	/*
	 * @param string type - One of "none", "directive", "slot" or "special".
	 * @param string tagName
	 * @param int level
	 * @param bool inline - Indicates whether a tag is inline. An inline tag does not have a matching `TAG_CLOSE`.
	 * @param array attributes
	 * @param string attributes.type
	 */
	TAG: "Tag",

	/*
	 * @param object start - A reference to the tag opening of type `TAG`.
	 * @param bool inline
	 */
	TAG_CLOSE: "CloseTag",

	COMMENT: "Comment",

	VARIABLE: "Variable",

	STATEMENT_START: "StatementStart",

	STATEMENT_END: "StatementEnd",

};

class Reader {
	
	constructor() {
		this.data = [];
	}

	push(rt, position, data = {}) {
		this.data.push(make(data, {rt, position}));
		return data;
	}

	pushAll(data) {
		this.data.push(...data);
	}

	inject(index, rt, position, data = {}) {
		this.data.splice(index, 0, make(data, {rt, position}));
		return data;
	}

	get tail() {
		return this.data[this.data.length - 1];
	}

}

module.exports = { ReaderType, Reader };
