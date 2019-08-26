var count = 0;
var values = &[count++];

<:this>
	<button +click={ *values.push(count++) }>Push</button>
	<button +click={ *values.pop() }>Pop</button>
	<button +click={ *values.unshift(count++) }>Unshift</button>
	<button +click={ *values.shift() }>Shift</button>
	<button +click={ *values.splice(2, 1) }>Remove 3rd</button>
	<button +click={ *values.splice(3, 1, count++) }>Replace 4th</button>

	<hr />

	foreach(*values as value) {
		var color = Sactory.css.rgb();
		<span
			&padding="2px 4px"
			&border-radius="3px"
			&background=color
			&color=Sactory.css.contrast(color)
			~text=value />
	}
</:this>
