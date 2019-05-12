window.addEventListener("load", function(){
	// query selector from variable
	@ = document.body;
	<!-- start -->
	<{document.body} class="body">
		// observable creation
		var tagName = **"div";
		// two-way binding for observable
		<input *value=*tagName />
		// bind omitting :to (it's taken from :condition)
		var timeout;
		<:bind-if :condition={ !!*tagName; } :cleanup={ clearTimeout(timeout); }>
			@text = "Tag name is now " + *tagName;
			//@text = `Tag name is now ${*tagName}`;
			var spread = {
				"@style.border": "3px dashed red",
				"@style.margin": "8px"
			}
			// computed tag name, computed attribute name and spread syntax
			var transparent = "background";
			<[*tagName] ["@style." + transparent]="transparent" ...spread>
				var type = **"text";
				<input type="text" *value=*type />
				<input type=*type @value="placeholder text" />
				<style>
					input[type='${*type}']${*type == "text" ? ",input:not([type])" : ""} {
						font-weight: bold;
					}
				</style>
				<p style="background:purple;color:white" @text=*tagName />
			</>
			<:bind :to=*tagName>
				var visible = **true;
				<label #html>
					Show:
					<input type="checkbox" $test=(/<div>*/gm) *checked=visible />
				</label>
				<button +click={ console.log("Button clicked") } @text="Button" @visible=*visible />
				<!-- a comment -->
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

	<:anchor>
		setTimeout(function(){
			<hr />
		}, 1000);
	</:anchor>

	<div>
		var duration = **30;
		var durationInSeconds = **(*duration + 's');
		<input type="number" step="1" *value=*duration />
		<style :scoped>
			.cookie {
				display: inline-block;
				transition: transform .25s;
				img {
					animation: rotate ${*durationInSeconds} linear infinite;
				}
				&:hover {
					transform: scale(1.25);
				}
				&:active {
					transform: scale(.75);
				}
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
		var cookies = **(parseInt(localStorage && localStorage.getItem("cookies")) || 0);
		function increment() {
			localStorage ? localStorage.setItem("cookies", ++*cookies) : *cookies++;
		}
		<div class="cookie"><img src="http://icons.iconarchive.com/icons/oxygen-icons.org/oxygen/256/Apps-preferences-web-browser-cookies-icon.png" +click=increment /></div>
		<p @text=("Clicked " + *cookies + " cookies! (" + (*cookies - ***cookies) + " in this session)") />
	</div>
});
