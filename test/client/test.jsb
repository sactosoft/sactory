window.addEventListener("load", function(){
	// query selector from variable
	@ = document.body;
	<{document.body} class="body">
		// observable creation
		var tagName = **"div";
		// two-way binding for observable
		<input @value=*tagName />
		// bind omitting :to (it's taken from :condition)
		var timeout;
		<:bind-if :condition=function(){ return !!*tagName; }>
			console.log("Tag name is now " + *tagName);
			var spread = {
				"@style.border": "3px dashed red",
				"@style.margin": "8px"
			}
			// computed tag name, computed attribute name and spread syntax
			var transparent = "background";
			<[*tagName] ["@style." + transparent]="transparent" ...spread>
				var type = **"text";
				<input type="text" @value=*type />
				<input type=*type @value="placeholder text" />
				<:bind :to=*type>
					<style>
						input[type='${*type}']${*type == "text" ? ",input:not([type])" : ""} {
							font-weight: bold;
						}
					</style>
				</:bind>
				<p style="background:purple;color:white" @text=*tagName />
			</>
			if(timeout !== undefined) clearTimeout(timeout);
			<:bind :to=*tagName>
				<button @text="Button" />
				timeout = setTimeout(function(){
					<button @text="Another button" />
				}, 5000);
			</:bind>
		</:bind-if>
		// update observable after timeout
		setInterval(function(){
			//*tagName = Math.random() >= .5 ? "section" : "div";
		}, 3000);
	</>

	<div>
		<style :scoped>
			img {
				animation: rotate 30s linear infinite;
			}
			@keyframes rotate {
				from {
					transform: rotate(0deg);
				}
				to {
					transform: rotate(360deg);
				}
			}
		</style>
		var cookies = **(parseInt(window.localStorage.getItem("cookies")) || 0);
		function increment() {
			window.localStorage.setItem("cookies", ++*cookies);
		}
		<img src="http://icons.iconarchive.com/icons/oxygen-icons.org/oxygen/256/Apps-preferences-web-browser-cookies-icon.png" +click=increment />
		<p @text=("Clicked " + *cookies + " cookies!") />
	</div>
});
