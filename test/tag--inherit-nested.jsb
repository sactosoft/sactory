<:this>
	<:inherit title="a" &color="blue">
		<div>title should be "a" and color "blue"</div>
		<:inherit title="b" &color="purple">
			<div>title should be "b" and color "purple"</div>
		</:inherit>
		<div &color="green">title should be "a" and color "green"</div>
	</:inherit>
</:this>
