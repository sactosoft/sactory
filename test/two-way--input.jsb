var value = &"";

<:this>
	<button +click={*value=""}>reset</button>
	<hr />
	<input *text=value />
	<hr />
	${*value}
</:this>
