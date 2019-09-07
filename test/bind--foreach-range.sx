var count = &10;

<:this>
	<button +click={*count++}>count++</button>
	<button +click={*count--}>count--</button>
	<section>
		Not observable:
		foreach(to ^count as i) {
			<span>${i}</span>
		}
	</section>
	<section>
		Observable (not optimised):
		foreach(to *count as i) {
			<span>${i}</span>
		}
	</section>
</:this>
