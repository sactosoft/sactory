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

	var tab = **("output", "current_tab");

	function switchTab(from, to) {
		if(*tab == from) *tab = to;
	}

	var inputs, output;

	var es6 = true;
	try {
		eval("var test = class {}");
	} catch(e) {
		es6 = false;
	}

	if(window.location.hash) {
		hash = JSON.parse(atob(window.location.hash.substr(1)));
	} else {
		file = **("snippet", "current_snippet");
		key = **("storage." + *file);
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
			html: "html:logic",
			css: "cssb"
		}
	};

	var modes = {
		js: ["code"],
		html: ["html", "html:logic", "text", "text:logic"],
		css: ["css", "css:logic", "cssb"]
	};

	var content = hash ? **(hash.content) : **(defaultContent, ***key);
	var showCount = **(*content.show.js + *content.show.html + *content.show.css);
	var result = **((function(){
		//console.clear();
		try {
			var ret = new Transpiler({}).transpile(
				*content.content.js +
				(*content.show.html ? "\n\n/* html */\n<:body #" + *content.mode.html + ">\n" + *content.content.html + "\n</:body>" : "") +
				(*content.show.css ? "\n\n/* css */\n<style :head #" + *content.mode.css + ">\n" + *content.content.css + "\n</style>" : ""));
			switchTab("error", "output");
			return ret;
		} catch(e) {
			switchTab("output", "error");
			return {error: e, compileError: true};
		}
	})());
	if(!hash) {
		if(window.localStorage && window.localStorage.getItem(***key)) {
			*content = JSON.parse(window.localStorage.getItem(***key));
		}
		@subscribe(file, function(value){
			content.internal.storage.key = *key;
			var set = content.internal.storage.set;
			content.internal.storage.set = function(){}; // disable saving
			content.merge(content.internal.storage.get(defaultContent));
			for(var type in *content.content) {
				inputs[type].setValue(*content.content[type]);
			}
			content.internal.storage.set = set; // enable saving
		});
	}

	function save() {
		content.merge({
			content: {
				js: inputs.js.getValue(),
				html: inputs.html.getValue(),
				css: inputs.css.getValue()
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
				.editor {
					display: inline-block;
					position: relative;
					width: calc(100% / ${*showCount});
					height: 100%;
					.mode {
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
	
	<:body +class=*alignment +class=(*result.error ? "has-errors" : "") +class=(*result.warnings && *result.warnings.length ? "has-warnings" : "")>

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
									<option value=value @text=value @selected=(value == ***file) />
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
				inputs = {};
				["js", "html", "css"].forEach(function(type){
					<div class="editor" @visible=*content.show[type]>
						inputs[type] = <textarea @value=*content.content[type] />;
						<select class="mode" @value=*content.mode[type] +change={ *content.mode[type] = this.value }>
							modes[type].forEach(function(m){
								<option value=m @text=m @selected=(***content.mode[type] == m) />
							});
						</select>
					</div>
				});
			</section>
		</section>

		<section class="bottom" :append>

			<nav>
				<div style="margin:8px 0 10px">
					Object.keys(tabs).forEach(function(key){
						<span class="item" @text=tabs[key] +class=(*tab == key ? "active" : "") +click={ *tab = key } />
					});
				</div>
			</nav>

			<section @visible=(*tab == "output") :append>
				<:bind-if :condition={ !*result.error } >
					var container = <iframe style="width:100%;height:100%;border:none" />
					window.sandbox = container.contentWindow;
					<{container.contentWindow.document.head}>
						<script src=document.querySelector("script[src*='sactory']").src />.onload = function(){
							/*try {
								container.contentWindow.eval(*result.source.all);
							} catch(e) {
								console.error(e);
								*result.error = e;
							}*/
							<script @textContent=("var $snippet=" + JSON.stringify(*key) + ";" + *result.source.all) />
						};
					</>
				</:bind-if>
			</section>

			<section @visible=(*tab == "error")>
				<textarea class="text color-red" readonly @value=(*result.error || "") />
			</section>

			<section @visible=(*tab == "warn")>
				<textarea class="text" readonly @value=(*result.warnings ? *result.warnings.join('\n') : "") />
			</section>

			<section @visible=(*tab == "code")>
				output = <textarea style="width:100%;height:180px" @value=(*result.source && *result.source.contentOnly) />
			</section>

			<section @visible=(*tab == "info")>
				<textarea class="text" readonly @value=(*result.compileError ? "" : JSON.stringify(*result, function(key, value){
					return key == "source" || key == "error" || key == "warnings" ? undefined : value;
				}, 4)) />
			</section>

		</section>

	</:body>

	var markers = [];

	Object.keys(inputs).forEach(function(type){
		var editor = CodeMirror.fromTextArea(inputs[type], {
			lineNumbers: true,
			indentWithTabs: true,
			smartIndent: false,
			lineWrapping: true,
			mode: type == "js" ? "javascript" : (type == "html" ? "htmlmixed" : "css")
		});
		editor.on("change", function(editor){
			/*markers.forEach(function(marker){
				input.removeLineClass(marker, "gutter", "error");
				input.removeLineClass(marker, "gutter", "warn");
			});*/
			//*content.content[type] = editor.getValue();
		});
		<{inputs[type].nextElementSibling} +keydown:ctrl:key.s:prevent=save />
		inputs[type] = editor;
	});

	output = CodeMirror.fromTextArea(output, {
		lineNumbers: true,
		lineWrapping: true,
		readOnly: true,
		mode: "javascript"
	});

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
		output.setValue(value.source ? value.source.contentOnly : "");
	});

	checkErrors(*result);
	checkWarnings(*result);

	// add active class to current tab

	<{"nav .item." + *tab} +class="active" />

};
