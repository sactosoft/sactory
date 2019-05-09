window.addEventListener("load", function(){

	var todos = **[];

	var value = **"";

	function add(value, checked) {
		*todos.push({
			value: **value,
			checked: **checked
		});
		todos.update();
	}

	function remove(index) {
		var list = *todos;
		list.splice(index, 1);
		*todos = list;
	}

	function submit() {
		var val = *value.trim();
		if(val.length) {
			add(val, false);
			*value = "";
		}
	}

	<:body>
		<:bind-each :to=*todos :as=todo :index=i>
			<div>
				<input type="checkbox" *checked=*(todo.checked) />
				<input type="text" *value=*(todo.value) />
				<button +click={ remove(i); } #html>&times;</button>
			</div>
		</:bind-each>
		<form +submit.prevent=submit>
			<input *value=*value />
			<button type="submit" @text="Add" />
		</form>
	</:body>

});
