var value = &"b";

<:this>
	<button +click={*value="b"}>reset</button>
	<hr />
	<select *value=value>
		<option value="a">A</option>
		<option value="b">B</option>
		<option value="c">C</option>
		<option value="d">D</option>
	</select>
	<hr />
	${*value}
</:this>