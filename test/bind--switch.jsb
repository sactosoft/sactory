var count = &0;

<:this>
	<button +click={*count++}>count++</button>
	<button +click={*count--}>count--</button>
	<hr />
	switch(*count) {
		case 0:
			Click the button to start
			break;
		case 1:
			<b>Number is 1</b>
			break;
		case 2:
		case 3:
			2 or 3
			break;
		case 4:
			4 and flow to default:
		default:
			Unknown number
	}
</:this>
