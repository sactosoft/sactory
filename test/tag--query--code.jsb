<:this>
	var a = <section title="a" />
	var b = <section title="b" />
	var c = <section title="c" />

	assert(<:query ("section") /> === a);
	assert(<:query ("section[title='b']") title="B" /> === b);
	assert(b.title == "B");

	assert(<:query-all ("section") />.length == 3);
</:this>
