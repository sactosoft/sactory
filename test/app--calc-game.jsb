var left = **;
var right = **;
var op = **;
var expected;

var level = 1;

var update = () => {
	*left = Math.floor(Math.random() * (level * 5));
	*right = Math.floor(Math.random() * (level * 2));
	*op = ['+', '-', '*'][Math.floor(Math.random() * 3)];
	expected = eval(*left + *op + *right);
};

update();

var result = **"";

var check = () => {
	if(parseInt(*result) === expected) {
		*result = "";
		level++;
		update();
	}
};

var add = value => {
	*result += value;
	check();
};

var invert = () => {
	if(*result.charAt(0) == '-') *result = *result.substr(1);
	else *result = '-' + *result;
	check();
};

var remove = () => {
	*result = *result.slice(0, -1);
	check();
};

@on(document, "keyup:key.0-9", event => add(event.key));
@on(document, "keyup:key.-", event => invert());
@on(document, "keyup:key.backspace", event => remove());

<:this>
	<style :scoped>
		button {
			width: 40px;
			margin: 2px;
		}
	</style>

	foreach(to 3 as i) {
		<div class="row">
			foreach(to 3 as j) {
				var number = i * 3 + j + 1;
				<button +click={ add(number) }>${number}</button>
			}
		</div>
	}
	<div class="row">
		<button +click=invert>±</button>
		<button +click={ add(0) }>0</button>
		<button +click=remove>&larr;</button>
	</div>

	<hr />

	${*left} ${*op} ${*right} = ${*result === '' ? '?' : *result}
</:this>
