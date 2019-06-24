window.onload = function(){

	var file, key, hash = null;

	var tabs = {
		"output": "Output",
		"error": "Errors",
		"warn": "Warnings",
		"code": "Transpiled Code",
		"info": "Info"
	};

	var debugMode = @watch(true, "is_debug");
	var alignment = @watch("y", "alignment");

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
			css: "ssb"
		}
	};

	var modes = {
		js: ["code"],
		html: ["html", "html :logic", "html :trimmed", "html :logic :trimmed", "text", "text :logic"],
		css: ["css", "css :logic", "ssb"]
	};

	var content = hash ? @watch.deep(hash.content) : @watch.deep(defaultContent, *key);
	var showCount = @watch(*content.show.js + *content.show.html + *content.show.css);
	var result = @watch((function(){
		*debugMode; // just to add it as a dependency
		var result = {source: "", before: "", after: "", info: {time: 0, tags: {}, features: []}, errors: [], warnings: []};
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
				console.error(e);
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
			content.storage.key = *key;
			var newContent = content.storage.get(defaultContent);
			content.storage.key = "";
			*content = newContent;
			content.storage.key = *key;
			for(var type in *content.content) {
				if(inputs[type]) inputs[type].setValue(*content.content[type]);
			}
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
		.fullscreen {
			position: fixed;
			top, bottom, left, right: 0;
		}
		.editor {
			display: inline-block;
			position: relative;
			width: calc(100% / ${*showCount});
			height: 100%;
		}
		.x {
			.top, .bottom {
				display: inline-block;
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
	
	<:body ~class=*alignment ~class:has-errors=*result.errors.length ~class:has-warnings=*result.warnings.length #html :logic :trimmed>

		<section class="top">
			<section class="filename">
				if(hash) {
					<span @textContent=hash.name />
				} else {
					<input *form=*file />
					if(window.localStorage) {
						<select *form=*file>
							foreach(Object.keys(window.localStorage).sort() as key) {
								if(key.substr(0, 8) == "storage.") {
									var value = key.substr(8);
									<option value=value @textContent=value />
								}
							}
						</select>
					}
				}
				foreach(*content.show as type) {
					<label style="margin-left:12px">
						<input style="vertical-align:middle" *checkbox=*content.show[type] />
						${type.toUpperCase()}
					</label>
				}
				<label style="margin-left:12px">
					debug
					<input style="vertical-align:middle" *checkbox=*debugMode />
				</label>
				<select style="margin-left:12px" *value=*alignment>
					<option value="y">Vertical</option>
					<option value="x">Horizontal</option>
				</select>
				<a id="github" href="https://github.com/sactory/sactory" target="_blank" @hidden=true />
				<span style="float:right;font-weight:bold;color:darkviolet;cursor:pointer" @textContent=("Sactory v" + Sactory.VERSION) +click={ this.previousElementSibling.click() } />
			</section>
			<section class="input">
				foreach(["js", "html", "css"] as type) {
					if(*content.show[type]) {
						<div id=type class="editor">
							<textarea @value=^content.content[type] #code>
								@on("documentappend", function(){
									inputs[type] = CodeMirror.fromTextArea(this, {
										lineNumbers: true,
										indentWithTabs: true,
										smartIndent: false,
										lineWrapping: true,
										mode: type == "js" ? "javascript" : (type == "html" ? "htmlmixed" : "css")
									});
									<{this.nextElementSibling} +[[save]]:prevent=save />
								});
							</textarea>
							<select class="mode" *form=*content.mode[type]>
								foreach(modes[type] as m) {
									<option value=m @textContent=m />
								}
							</select>
						</div>
					}
				}
			</section>
		</section>

		<section class="bottom">

			<nav>
				<div style="margin:8px 0 10px">
					foreach(Object.keys(tabs) as key) {
						<span class="item" ~class=key ~class:active=(*tab == key) +click={ *tab = key } @textContent=tabs[key] />
					}
				</div>
			</nav>

			<section @visible=(*tab == "output")>
				if(!*result.error) {
					<iframe style="width:100%;height:100%;border:none" src="about:blank" #code>
						@on("documentappend", function(){
							window.sandbox = this.contentWindow;
							<{this.contentWindow.document.head}>
								<meta charset="UTF-8" />
								<script src=("../dist/sactory" + (*debugMode ? ".debug" : "") + ".js") />.onload = function(){
									<script @textContent=("var $snippet=" + JSON.stringify('$' + *key) + ";" + *result.before + *result.source + *result.after) />
								};
							</>
						});
					</iframe>
				}
			</section>

			<section @visible=(*tab == "error")>
				<textarea class="text color-red" readonly @value=*result.errors.join('\n') />
			</section>

			<section @visible=(*tab == "warn")>
				<textarea class="text" readonly @value=(*result.warnings ? *result.warnings.join('\n') : "") />
			</section>

			if(*tab == "code") {
				<section>
					foreach(["js", "html", "css"] as type) {
						if(*content.show[type]) {
							<div id=("output-" + type) class="editor" #code>
								<textarea @value=(^result[type] || "")>
									@on("documentappend", function(){
										outputs[type] = CodeMirror.fromTextArea(this, {
											lineNumbers: true,
											lineWrapping: true,
											readOnly: true,
											mode: "javascript"
										});
									});
								</textarea>
							</div>
						}
					}
				</section>
			}

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
