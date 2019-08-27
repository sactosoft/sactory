var expr = &"";
var result = & => {
	try {
		return +eval(*expr);
	} catch(e) {
		return NaN;
	}
};

<:this>
	<input *text=expr /> = ${*result}
</:this>