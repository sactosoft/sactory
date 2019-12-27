const { ReaderType } = require("../const");

function collectObservables(data) {
	let ret = [];
	data.forEach(({rt, expr}) => {
		if(rt === ReaderType.OBSERVABLE_VALUE) {
			ret.push(expr);
		}
		if(expr) {
			ret.push(...collectObservables(expr));
		}
	});
	return ret;
}

function countObservables(data) {
	return collectObservables(data).length;
}

module.exports = { collectObservables, countObservables };
