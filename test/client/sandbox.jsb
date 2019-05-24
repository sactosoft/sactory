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

	var input, output;

	var es6 = true;
	try {
		eval("class Test {}");
	} catch(e) {
		es6 = false;
	}

	var defaultContent = "var name = **\"world\";\n\n<h1 @text=" + (es6 ? "`Hello, ${*name}!`" : "(\"Hello, \" + *name)") + " />\n";

	if(window.location.hash) {
		hash = JSON.parse(atob(window.location.hash.substr(1)));
	} else {
		file = **("snippet", "current_snippet");
		key = **("storage." + *file);
	}

	var content = hash ? **(hash.content) : **(defaultContent, ***key);
	var result = **((function(){
		console.clear();
		try {
			var ret = new Transpiler().transpile(*content, {scope: "document.body"});
			switchTab("error", "output");
			return ret;
		} catch(e) {
			switchTab("output", "error");
			return {error: e, compileError: true};
		}
	})());

	if(!hash) {
		file.subscribe(function(value){
			content.internal.storage.key = ***key;
			var set = content.internal.storage.set;
			content.internal.storage.set = function(){}; // disable saving
			input.setValue(*content = content.internal.storage.get(defaultContent));
			content.internal.storage.set = set; // enable saving
		});
	}

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
			.editor {
				height: calc(100% - 34px);
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
						left: 0;
						right: 0;
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
			.result {
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
			margin: 8px;
			width: calc(100% - 16px);
			height: calc(100% - 16px);
			border: none;
			font-family: monospace;
			&:focus {
				outline: none;
			}
		}
		.color-red {
			color: ${color.red.text};
		}

		.CodeMirror {
			height: 100%;
			border-top: 1px solid silver;
			border-bottom: 1px solid silver;
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
								if(key.substr(0, 8) == "storage.") <option value=key.substr(8) @text=key.substr(8) />
							});
						</select>
					}
				}
				var github = <a href="https://github.com/sactory/sactory" target="_blank" @hidden=true />
				<span style="float:right;font-weight:bold;color:darkviolet;cursor:pointer" @text=("Sactory v" + Sactory.VERSION) +click={ github.click() } />
			</section>
			<section class="editor">
				input = <textarea style="width:100%;height:360px;font-family:monospace" *value=*content />
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

			<section class="result" @visible=(*tab == "output") :append>
				<:bind-if :condition={ !*result.error } >
					var container = <iframe style="width:100%;height:100%;border:none" />
					<script @=container.contentWindow.document.head async src=document.querySelector("script[src*='sactory']").src />.onload = function(){
						window.sandbox = container.contentWindow;
						try {
							container.contentWindow.eval(*result.source.all);
						} catch(e) {
							console.error(e);
							*result.error = e;
						}
					};
				</:bind-if>
			</section>

			<section @visible=(*tab == "error")>
				<textarea class="text color-red" readonly @value=(*result.error || "") />
			</section>

			<section @visible=(*tab == "warn")>
				<textarea class="text" readonly @value=(*result.warnings ? *result.warnings.join('\n') : "") />
			</section>

			<section class="result" @visible=(*tab == "code")>
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

	input = CodeMirror.fromTextArea(input, {
		lineNumbers: true,
		indentWithTabs: true,
		smartIndent: false,
		lineWrapping: true
	});
	input.on("change", function(editor){
		markers.forEach(function(marker){
			input.removeLineClass(marker, "gutter", "error");
			input.removeLineClass(marker, "gutter", "warn");
		});
		*content = editor.getValue();
	});

	output = CodeMirror.fromTextArea(output, {
		lineNumbers: true,
		lineWrapping: true,
		readOnly: true
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
