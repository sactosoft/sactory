class Test {

	render({color}) {
		return <?span &color=color />
	}

}

Sactory.replaceWidget("test", Test);

<:this>
	<test $color="green">WORKS</test>
	<p $$test:color="purple">DOESN'T</p>
	<p $$[Test]:color="blue">DOESN'T</p>
</:this>
