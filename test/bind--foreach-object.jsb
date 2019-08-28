var data = &{
	name: "Mark",
	surname: "White",
	age: 23
};

var key, value;
var update = () => {
	*data[key] = value;
	data.triggerUpdate();
};

<:this>
	<form +submit:prevent=update>
		<input placeholder="Key" *text=key />
		<input placeholder="Value" *text=value />
		<button>Update</button>
	</form>
	<hr />
	<section>
		Original:
		foreach(^data as key: value) {
			<div>${key}: ${value}</div>
		}
	</section>
	<hr />
	<section>
		Observable:
		foreach(*data as key: value) {
			<div>${key}: ${value}</div>
		}
	</section>
</:this>
