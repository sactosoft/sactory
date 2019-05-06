window.addEventListener("load", function(){
	// query selector from variable
	<{document.body} class="body">
		// observable creation
		var tagName = **"div";
		// two-way binding for observable
		<input @value=*tagName />
		// bind omitting :to (it's taken from :condition)
		<:bind-if :condition=function(){ return !!*tagName; }>
			var spread = {
				"@style.border": "3px dashed red",
				"@style.margin": "8px"
			}
			// computed tag name and spread syntax
			<[*tagName] @style.background="transparent" ...spread>
				var type = **"text";
				<input type="text" @value=*type />
				<input type=*type @value="placeholder text" />
			</>
		</:bind-if>
		// update observable after timeout
		setInterval(function(){
			*tagName = "section";
		}, 3000);
	</>

	// test query selectors
	<"script">console.log("\"script\"", @);</>
	<{document.body, "script"}>console.log("{document.body, \"script\"}", @);</>
	<{document.head, "script"}>console.log("{document.head, \"script\"}", @);</>
	return <div @ />;
});
