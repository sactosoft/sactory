var wrapper = &{value: 100};

<:this>
	<input *number=*wrapper.value />
	<hr />
	<span :ref=display>${*wrapper.value}</span>
	<button +click={wrapper.triggerUpdate()}>update</button>
	<button +click={*wrapper={value: 100}}>reset</button>
</:this>