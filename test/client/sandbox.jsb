window.onload = function(){

	var file = **("snippet", "current_snippet");
	var key = **("storage." + *file);

	var input, output;

	var es6 = true;
	try {
		eval("class Test {}");
	} catch(e) {
		es6 = false;
	}

	var defaultContent = "var name = **\"world\";\n\n<h1 @text=" + (es6 ? "`Hello, ${*name}!`" : "(\"Hello, \" + *name)") + " />\n";

	var content = **(defaultContent, ***key);
	var result = **((function(){
		try {
			return new Transpiler().transpile(*content, {scope: "document.body"});
		} catch(e) {
			console.warn(e);
			return {error: e, parserError: true};
		}
	})());

	file.subscribe(function(value){
		content.internal.storage.key = ***key;
		var set = content.internal.storage.set;
		content.internal.storage.set = function(){}; // disable saving
		input.setValue(*content = content.internal.storage.get(defaultContent));
		content.internal.storage.set = set; // enable saving
	});

	<style :head>
		body {
			font-family: Arial;
		}
		section + section {
			margin-top: 8px;
		}
		.CodeMirror, textarea {
			border: 1px solid silver;
		}
		.error {
			font-family: monospace;
			color: red;
			border: none;
			width: 100%;
			height: 200px;
		}
	</style>
	
	<:body>

		<section>
			<input *value=*file />
			if(window.localStorage) {
				<select *value=*file>
					Object.keys(window.localStorage).forEach(function(key){
						if(key.substr(0, 8) == "storage.") <option value=key.substr(8) @text=key.substr(8) />
					});
				</select>
			}
		</section>

		<section>
			input = <textarea style="width:100%;height:360px;font-family:monospace" *value=*content />
		</section>

		<section @visible=!*result.parserError>
			output = <textarea style="width:100%;height:180px" @value=(*result.source && *result.source.contentOnly) />
			<span @text=("Transpiled in " + Math.round(*result.time * 1000) / 1000 + " ms") />
		</section>

		<section @visible=!!*result.error>
			<textarea class="error" readonly @value=*result.error />
		</section>

		<:bind-if :condition={ !*result.error } >
			var container;
			<section>
				container = <iframe style="width:100%;height:calc(100vh - 16px);border:none" />
			</section>
			<script @=container.contentWindow.document.head async src="../dist/sactory.js" />.onload = function(){
				try {
					container.contentWindow.eval(*result.source.all);
				} catch(e) {
					*result.error = e;
				}
			};
		</:bind-if>

	</:body>

	input = CodeMirror.fromTextArea(input, {
		lineNumbers: true,
		indentWithTabs: true,
		smartIndent: false,
		lineWrapping: true
	});
	input.on("change", function(editor){
		*content = editor.getValue();
	});

	output = CodeMirror.fromTextArea(output, {
		lineNumbers: true,
		lineWrapping: true,
		readOnly: true
	});

	result.subscribe(function(value){
		output.setValue(value.source ? value.source.contentOnly : "");
	});

};
