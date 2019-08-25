class Card {

	static style() {
		return <style>
			.header {
				font-size: 2rem;
			}

			.footer {
				font-size: .5rem;
			}
		</style>
	}
	
	render() {
		return <div>
			<div class="header" :slot="header" />
			<div class="body" :slot="body" :slot />
			<div class="footer" :slot="footer" />
		</div>
	}

}

<:this>
	<[Card]>
		<:slot (header)>Header</:slot>
		Body (without slot)
		<:slot (body)>Body (using slot)</:slot>
		<:slot (footer)>Footer</:slot>
	</[Card]>
</:this>
