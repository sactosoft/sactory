window.onload = function(){

	var alignment = **"y";

	var file, key, hash = null;

	var tabs = {
		"output": "Output",
		"error": "Errors",
		"warn": "Warnings",
		"code": "Transpiled Code",
		"info": "Info"
	};

	var tab = @watch("output", "current_tab");

	function switchTab(from, to) {
		if(*tab == from) *tab = to;
	}

	var inputs = {};
	var outputs = {};

	if(window.location.hash) {
		hash = JSON.parse(atob(window.location.hash.substr(1)));
	} else {
		file = @watch("snippet", "current_snippet");
		key = @watch("storage." + *file);
	}

	var defaultContent = {
		content: {
			js: "var count = **0;\n",
			html: "<button +click={ *count++ }>\n\tClicked ${*count} times\n</button>\n\nif(*count > 0) {\n\t<button +click={ *count = 0 }>\n\t\tReset count\n\t</button>\n}\n",
			css: ""
		},
		show: {
			js: true,
			html: true,
			css: false
		},
		mode: {
			js: "code",
			html: "html :logic",
			css: "cssb"
		}
	};

	var modes = {
		js: ["code"],
		html: ["html", "html :logic", "html :trimmed", "html :logic :trimmed", "text", "text :logic"],
		css: ["css", "css :logic", "cssb"]
	};

	var content = hash ? @watch(hash.content) : @watch(defaultContent, *key);
	var showCount = @watch(*content.show.js + *content.show.html + *content.show.css);
	var result = @watch((function(){
		var result = {source: "", before: "", after: "", info: {time: 0, tags: {}, templates: {}, features: []}, errors: [], warnings: []};
		var transpiler = new Transpiler({namespace: file.value});
		function transpile(type, before, after) {
			before = before ? before + '<!COMMENT start>' : "";
			after = after ? '<!COMMENT end>' + after : "";
			try {
				var info = transpiler.transpile(before + *content.content[type] + after);
				result.info.time += info.time;
				result.info.variables = info.variables;
				for(var tag in info.tags) {
					result.info.tags[tag] = (result.info.tags[tag] || 0) + info.tags[tag];
				}
				for(var template in info.templates) {
					result.info.templates[template] = (result.info.templates[template] || 0) + info.templates[template];
				}
				info.features.forEach(function(feature){
					if(result.info.features.indexOf(feature) == -1) result.info.features.push(feature);
				});
				Array.prototype.push.apply(result.warnings, info.warnings);
				var source = info.source.contentOnly;
				if(before) source = source.substr(source.indexOf("/*start*/") + 9);
				if(after) source = source.substring(0, source.lastIndexOf("/*end*/"));
				result[type] = source;
				result.before = info.source.before;
				result.source += info.source.contentOnly;
				result.after = info.source.after;
			} catch(e) {
				result.errors.push(e);
			}
		}
		transpile("js");
		if(*content.show.html) transpile("html", "<:body #" + *content.mode.html + ">", "</:body>");
		if(*content.show.css) transpile("css", "<style :head #" + *content.mode.css + ">", "</style>");
		if(result.errors.length) switchTab("output", "error");
		else switchTab("error", "output");
		return result;
	})());
	if(!hash) {
		if(window.localStorage && window.localStorage.getItem(*key)) {
			*content = JSON.parse(window.localStorage.getItem(*key));
		}
		@subscribe(file, function(value){
			content.internal.storage.key = *key;
			var set = content.internal.storage.set;
			content.internal.storage.set = function(){}; // disable saving
			content.merge(content.internal.storage.get(defaultContent));
			for(var type in *content.content) {
				if(inputs[type]) inputs[type].setValue(*content.content[type]);
			}
			content.internal.storage.set = set; // enable saving
		});
	}

	function save() {
		content.merge({
			content: {
				js: inputs.js ? inputs.js.getValue() : "",
				html: inputs.html ? inputs.html.getValue() : "",
				css: inputs.css ? inputs.css.getValue() : ""
			}
		});
	}

	window.export = function(){
		return window.location + '#' + btoa(JSON.stringify({name: *file, content: *content}));
	};

	<style :head>
		var fontFamily = "Segoe UI";
		var color = {
			red: {
				background: "#D32F2F",
				text: "#F44336"
			}
		};
		body {
			margin: 0;
			font-family: ${fontFamily};
			overflow-y: hidden;
		}
		.top {
			.filename {
				span, input, select {
					font-family: ${fontFamily};
					height: 26px;
					margin: 4px 0 4px 4px;
					padding: 0 8px;
				}
			}
			.input {
				height: calc(100% - 34px);
				.editor .mode {
					position: absolute;
					z-index: 999;
					top: 8px;
					right: 22px;
					padding: 2px 4px;
					font-size, line-height: 12px;
					background: rgba(187, 187, 187, .3);
					color: #333;
					border-radius: 1000px;
					border: none;
					opacity: .5;
					transition: opacity .1s linear;
					&:hover {
						opacity: 1;
					}
					&:focus {
						outline: none;
					}
				}
			}
		}
		.bottom {
			nav {
				.item {
					position: relative;
					cursor: pointer;
					padding: 8px;
					&:hover::after, &.active::after {
						content: '';
						position: absolute;
						bottom: -2px;
						left, right: 0;
						height: 4px;
					}
					&:not(.active):hover::after {
						opacity: .5;
						background: darkviolet;
					}
					&.active::after {
						background: darkviolet;
					}
					.has-errors &.error, .has-warnings &.warn {
						&::before {
							content: '• ';
							color: ${color.red.text};
							font-weight: bold;
						}
					}
				}
			}
			section {
				height: calc(100% - 40px);
			}
		}
		.editor {
			display: inline-block;
			position: relative;
			width: calc(100% / ${*showCount});
			height: 100%;
		}
		.x {
			.top, .bottom {
				width: 50%;
				height: 100vh;
			}
		}
		.y {
			.top, .bottom {
				height: 50vh;
			}
		}
		.text {
			padding: 8px;
			width, height: 100%;
			border: none;
			font-family: monospace;
			resize: none;
			&:focus {
				outline: none;
			}
		}
		.color-red {
			color: ${color.red.text};
		}

		.CodeMirror {
			height: 100%;
			border-top, border-bottom: 1px solid silver;
			.error::before, .warn::before {
				position: absolute;
				font-size: .8em;
			}
			.error::before {
				content: '🛑';
			}
			.warn::before {
				content: '⚠️';
			}
		}
	</style>
	
	<:body +class=*alignment +class=(*result.errors.length && "has-errors") +class=(*result.warnings.length && "has-warnings")>

		<section class="top">
			<section class="filename">
				if(hash) {
					<span @text=hash.name />
				} else {
					<input *value=*file />
					if(window.localStorage) {
						<select *value=*file>
							Object.keys(window.localStorage).sort().forEach(function(key){
								if(key.substr(0, 8) == "storage.") {
									var value = key.substr(8);
									<option value=value @text=value @selected=(value == ^file) />
								}
							});
						</select>
					}
				}
				Object.keys(*content.show).forEach(function(type){
					<label style="margin-left:12px">
						//<input type="checkbox" style="vertical-align:middle" *checked=*content.show[type] />
						<input type="checkbox" style="vertical-align:middle" @checked=*content.show[type] +change={ *content.show[type] = this.checked } />
						@text = type.toUpperCase();
					</label>
				});
				var github = <a href="https://github.com/sactory/sactory" target="_blank" @hidden=true />
				<span style="float:right;font-weight:bold;color:darkviolet;cursor:pointer" @text=("Sactory v" + Sactory.VERSION) +click={ github.click() } />
			</section>
			<section class="input">
				["js", "html", "css"].forEach(function(type){
					<:bind-if :condition={ *content.show[type] } :change={ !!document.getElementById(type) != newValue.show[type] }>
						<div id=type class="editor">
							var textarea = <textarea @value=*content.content[type] />;
							// init the next tick so everything is already appended to the DOM
							setTimeout(function(){
								inputs[type] = CodeMirror.fromTextArea(textarea, {
									lineNumbers: true,
									indentWithTabs: true,
									smartIndent: false,
									lineWrapping: true,
									mode: type == "js" ? "javascript" : (type == "html" ? "htmlmixed" : "css")
								});
								<{textarea.nextElementSibling} +[[save]]:prevent=save />
							}, 0);
							<select class="mode" @value=*content.mode[type] +change={ *content.mode[type] = this.value }>
								modes[type].forEach(function(m){
									<option value=m @text=m @selected=(^content.mode[type] == m) />
								});
							</select>
						</div>
					</:bind-if>
				});
			</section>
		</section>

		<section class="bottom" :append>

			<nav>
				<div style="margin:8px 0 10px">
					Object.keys(tabs).forEach(function(key){
						<span class="item" +class=key @text=tabs[key] +class=(*tab == key ? "active" : "") +click={ *tab = key } />
					});
				</div>
			</nav>

			<section @visible=(*tab == "output") :append>
				<:bind-if :condition={ !*result.error } >
					var container = <iframe style="width:100%;height:100%;border:none" />
					window.sandbox = container.contentWindow;
					<{container.contentWindow.document.head}>
						<script src="../dist/sactory.debug.js" />.onload = function(){
							/*try {
								container.contentWindow.eval(*result.source.all);
							} catch(e) {
								console.error(e);
								*result.error = e;
							}*/
							<script @textContent=("var $snippet=" + JSON.stringify('$' + *key) + ";" + *result.before + *result.source + *result.after) />
						};
					</>
				</:bind-if>
			</section>

			<section @visible=(*tab == "error")>
				<textarea class="text color-red" readonly @value=*result.errors.join('\n') />
			</section>

			<section @visible=(*tab == "warn")>
				<textarea class="text" readonly @value=(*result.warnings ? *result.warnings.join('\n') : "") />
			</section>

			<:bind-if :condition={ *tab == "code" }>
				<section>
					["js", "html", "css"].forEach(function(type){
						<:bind-if :condition={ *content.show[type] } :change={ !!@.querySelector("#output-" + type) != newValue.show[type] }>
							<div id=("output-" + type) class="editor">
								var textarea = <textarea @value=(*result[type] || "") />;
								// init the next tick so everything is already appended to the DOM
								setTimeout(function(){
									outputs[type] = CodeMirror.fromTextArea(textarea, {
										lineNumbers: true,
										lineWrapping: true,
										readOnly: true,
										mode: "javascript"
									});
								}, 0);
							</div>
						</:bind-if>
					});
				</section>
			</:bind-if>

			<section @visible=(*tab == "info")>
				<textarea class="text" readonly @value=(*result.errors.length ? "" : JSON.stringify(*result.info, null, 4)) />
			</section>

		</section>

	</:body>

	var markers = [];

	function checkErrors(value) {
		var match = value.error && value.error.toString().match(/^ParserError: Line (\d+), Column (\d+)/);
		if(match) {
			markers.push(input.addLineClass(parseInt(match[1]) - 1, "gutter", "error"));
		}
	}

	function checkWarnings(value) {
		if(value.warnings) {
			value.warnings.forEach(function(message){
				var match = message.match(/^Line (\d+), Column (\d+)/);
				if(match) {
					markers.push(input.addLineClass(parseInt(match[1]) - 1, "gutter", "warn"));
				}
			});
		}
	}

	result.subscribe(function(value){
		checkErrors(value);
		checkWarnings(value);
		for(var type in outputs) {
			outputs[type].setValue(value[type] || "");
		}
	});

	checkErrors(*result);
	checkWarnings(*result);

};
