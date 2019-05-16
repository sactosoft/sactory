window.onload = function(){

	<style :head>
		body {
			font-family: Arial;
		}
		.CodeMirror {
			border: 1px solid silver;
			margin-bottom: 8px;
		}
	</style>
	
	<:body>

		var es6 = false;
		try {
			eval("class Test {}");
		} catch(e) {
			es6 = false;
		}

		var content = **("var name = **\"world\";\n\n<h1 @text=" + (es6 ? "`Hello ${*name}!`" : "(\"Hello \" + *name)") + " />", "sandbox");
		var result = **((function(){
			try {
				return new Transpiler().transpile(*content, {scope: "document.body"});
			} catch(e) {
				return {error: e.message};
			}
		})());

		CodeMirror.fromTextArea(<textarea style="width:100%;height:360px;font-family:monospace" *value=*content />, {
			lineNumbers: true,
			indentWithTabs: true,
			smartIndent: false,
			lineWrapping: true
		}).on("change", function(editor){
			*content = editor.getValue();
		});

		var readonly = CodeMirror.fromTextArea(<textarea style="width:100%;height:180px" readonly @value=(*result.error || *result.source.contentOnly) />, {
			lineNumbers: true,
			lineWrapping: true
		});

		result.subscribe(function(value){
			readonly.setValue(value.error || value.source.contentOnly);
		});

		<span @text=("Transpiled in " + *result.time + " ms") />

		<:bind-if :condition={ !*result.error } >
			var container = <iframe style="width:100%;height:calc(100vh - 16px);border:none;margin-top:8px" />;
			<script @=container.contentWindow.document.head async src="../dist/sactory.js" />.onload = function(){
				try {
					container.contentWindow.eval(*result.source.all);
				} catch(e) {
					*result = {error: e.message};
				}
			};
		</:bind-if>

	</:body>

};
