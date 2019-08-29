class Parent {

	render() {
		return <section>
			<span &color="blue">PARENT</span>
			<::child>OWN CHILD!</::child>
		</section>
	}
	
	render__child() {
		return <button />
	}

}

Sactory.addWidget("parent", Parent);

<:this>
	<[Parent]>
		<::child>From `[Parent]`</::child>
		<div>
			<::child>Nested</::child>
			<Parent::child>Named</Parent::child>
		</div>
	</[Parent]>

	<hr />

	<parent>
		<::child>From `parent`</::child>
		<div>
			<::child>Nested</::child>
			<parent::child>Named</parent::child>
		</div>
	</parent>
</:this>
