window.addEventListener("load", function(){

	// query selector from variable
	@ = document.body;

	// observable creation
	var tagName = **"div";

	<!-- start -->
	<{document.body} class="body">
		// two-way binding for observable
		<input *value=*tagName />
		// bind omitting :to (it's taken from :condition)
		var timeout;
		<:bind-if :condition={ !!*tagName; } :cleanup={ clearTimeout(timeout); }>
			@text = "Tag name is now " + *tagName;
			var spread = {
				"@style.border": "3px dashed red",
				"@style.margin": "8px"
			}
			// computed tag name, computed attribute name and spread syntax
			var transparent = "background";
			<[*tagName] @["style." + transparent]="transparent" ...spread>
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
					<input type="checkbox" *checked=visible />
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

	var o = **"o";
	<p style="font-family:monospace" #text>~~ DI${*o} CANE ~~</p>

	setInterval(function(){
		*o = Math.random() >= .5 ? 'o' : 'O';
	}, 250);

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
		var cookies = **(0, "cookies");
		<div class="cookie"><img src="http://icons.iconarchive.com/icons/oxygen-icons.org/oxygen/256/Apps-preferences-web-browser-cookies-icon.png" +click={ *cookies++ } /></div>
		<p @text=`Clicked ${*cookies} cookies! (${*cookies - ***cookies} in this session)` />
	</div>

	<svg>
		<rect x=0 y=0 width=5 height=5 />
	</svg>

	var langs = {
		en: {
			welcome: "Welcome",
			goodbye: "Goodbye"
		},
		it: {
			welcome: "Benvenuti",
			goodbye: "Arrivederci"
		},
		fur: {
			welcome: "Benvignûts",
			goodbye: "Ariviodisi"
		}
	}

	var langValue = **"en";
	var lang = **(langs[*langValue] || langs.en);

	<p #html>Language is set to <input style="width:32px" *value=*langValue />, ${*lang.welcome}! ${*lang.goodbye}.</p>

	var test = **true;

	<input type="checkbox" *checked=*test />

	<#hl>
		Some text
		<p>Some tag</p>
		if(*test) {
			if(*tagName == "div") <span>Only if true and *tagName == "div"</span>
		} else if(*o == 'o') {
			<span>Variable 'o' is lowercase</span>
		} else {
			<span>Only if false</span>
		}
		for(var i=1; i<=6; i++) {
			<['h' + i]>The big brown fox jumps over the lazy dog</>
		}
	</#hl>

	var html = **"";

	<textarea style="width:600px;height:400px;font-family:monospace" *value=*html />

	<div style="margin:8px 0;border:4px solid silver">
		@innerHTML = *html;
	</div>

});
