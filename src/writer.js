const { ReaderType } = require("./const");

class Writer {

	write(data) {
		let ret = [];
		data.forEach(d => {
			ret.push(...[].concat(this["write" + d.rt](d)));
		});
		return ret;
	}

}

Object.values(ReaderType).forEach(type => {
	Writer.prototype["write" + type] = function(){
		throw new Error("Not implemented.");
	};
});


module.exports = Writer;
