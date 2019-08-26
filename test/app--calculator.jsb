var expr = **"";
var result = **NaN;

@subscribe(expr, value => {
	try {
		*result = eval(value);
	} catch(e) {
		*result = NaN;
	}
});

<:this>
	<input *text=expr /> = ${*result}
</:this>