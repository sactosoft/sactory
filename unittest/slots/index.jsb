@widgets.add("card", class {

	@render() {
		return <div class="card">
			<div class="card-header" :slot="header" />
			<div class="card-body" :slot="body" :slot />
			<div class="card-footer" :slot="footer" />
		</div>
	}

});
