class Parent {

	render() {
		return <section>
			<span &color="blue">PARENT</span>
			<$child>OWN CHILD!</$child>
		</section>
	}
	
	render$child() {
		return <button />
	}

	render$hyphenatedChild() {
		return <button &color="white" />
	}

}

Sactory.addWidget("parent", Parent);

<:this>
	<[Parent]>
		<$child>From `[Parent]`</$child>
		<div>
			<$child>Nested</$child>
			<$hyphenated-child>Hyphenated</$hyphenated-child>
			<Parent$child>Named</Parent$child>
		</div>
	</[Parent]>

	<hr />

	<parent>
		<$child>From `parent`</$child>
		<div>
			<$child>Nested</$child>
			<$hyphenated-child>Hyphenated</$hyphenated-child>
			<parent$child>Named</parent$child>
		</div>
	</parent>
</:this>
