var a = [];
var b = 2;
var c = 3;
var d = 4;

<section
/>

<section a />

<section
	a />
	
<section
	a=
		"b" />
		
<section
	a
	=
	"b"
/>

<section {a, b, c} />

<section {a,
	b, c} />
	
<section {
	...a,
	b
} />

<section ...{a,
	b, c,
	d} />
	
<section a /*
	multiline
	comment */ b />
	
<section :a
	:b=1 />
