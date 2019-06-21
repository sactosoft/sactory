<link href="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css" rel="stylesheet" :head />

@widgets.add("button", class {
	
	constructor({type}) {
		this.type = type;
	}

	@render() {
		return <?["button"] ~class="btn" ?~class:btn-[this.type]=this.type />
	}

});
