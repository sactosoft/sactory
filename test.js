var fs = require("fs");

var { version } = require("./version");
var { transpile } = require("./transpiler");

var { transform } = require("babel-core");

var nop = () => {};

var data = [];

var babel = source => {
	try {
		return transform(source, {presets: [["babel-preset-env", {modules: false}]]}).code;
	} catch(e) {
		return `throw new Error("Could not transpile")`;
	}
};

fs.readdirSync("./test/").forEach(filename => {
	var [type, name, mode] = filename.slice(0, -4).split("--");
	var source = fs.readFileSync("./test/" + filename, "utf8");
	var error, result;
	try {
		result = transpile({filename, mode: "auto-code@logic", versionCheck: false, env: ["amd"], es6: true, bind: "__bind", before: "return function(__bind){", after: "}"}, source);
		fs.writeFile(`./_test/${type}--${name}__es6.js`, result.source.all, nop);
		fs.writeFile(`./_test/${type}--${name}__es5.js`, babel(result.source.all), nop);
	} catch(e) {
		error = e;
	}
	data.push({type, name, source, error, result});
});

data = data.map(({type, name, source, error, result}) => `{type:"${type}",name:"${name}",source:${JSON.stringify(source)},error:${JSON.stringify(error)},time:${Math.round(result.time * 1000) / 1000},content:${result.source && JSON.stringify(result.source.contentOnly)}}`);

var source = transpile({mode: "auto-code@logic,trimmed"}, `
var es6 = @watch(true, "__test__es6");
var tests, container, sources = {}, editors;
var bind, showSource = **false;

function test(info, outcome) {
	if(bind) bind.rollback();
	bind = Sactory.bindFactory.fork();
	bind.name = "test";
	<:use (outcome) @textContent="RUNNING" />
	*showSource = false;
	require(["./" + info.type + "--" + info.name + "__es" + (*es6 ? 6 : 5)], function(fun){
		try {
			fun.call(<:use (container) :clear />, bind);
			<:use (outcome) :clear><span &color="green" ~text="SUCCESS" /></:use>
		} catch(error) {
			<:use (outcome) :clear><span &color="red" ~text="ERROR" /></:use>
			console.error(error);
		}
	});
}

function testAll() {
	var count = 0;
	data.forEach(function(info, i){
		if(!info.error) {
			var outcome = tests.childNodes[i + 1].childNodes[3];
			<:use (outcome) @textContent="QUEUED" />
			setTimeout(test.bind(null, info, outcome), ++count * 100);
		}
	});
}

function source(info) {
	*showSource = true;
	for(var name in sources) {
		<:use (sources[name]) :clear />
	}
	editors = {};
	initEditor("upper", info.source);
	initEditor("lower", info.content);
}

function initEditor(name, source) {
	var container = sources[name];
	var width = container.offsetWidth - 4;
	var height = container.offsetHeight - 4;
	setTimeout(function(){
		var editor = editors[name] = new CodeMirror(container, {
			value: source,
			mode: "javascript",
			theme: "sactory",
			lineNumbers: true,
			lineWrapping: true,
			readOnly: true
		});
		editor.setSize(width, height);
	});
}

function format(num){
	num = num.toString();
	var dot = num.indexOf(".");
	if(dot == -1) {
		return num + ".000";
	} else {
		var i = num.length - dot;
		//while(i++ < 4) {
		while(++i < 5) {
			num += "0";
		}
		return num;
	}
};

<:head>
	<style>
		* {
			box-sizing: border-box;
		}

		.text {
			&, button, input {
				font-family: Consolas, monospace, sans-serif;
				font-size: 13px;
			}
		}

		.border {
			border: 4px solid silver;
		}

		.container {
			width: 100%;
			height: calc(100vh - 96px);
			border-collapse: collapse;
			& > tr > td {
				vertical-align: top;
				padding: 0;
			}
		}

		.data {
			white-space: nowrap;
			th {
				padding: 4px 0;
			}
			td {
				padding: 2px 8px;
				&:nth-child(1) {
					padding-right: 0;
				}
				&:nth-child(2) {
					padding-left: 0;
				}
				&:nth-child(3) {
					text-align: right;
				}
				&:nth-child(4) {
					min-width: 67px;
				}
			}
			tr td:first-child {
				text-align: right;
				&::after {
					content: "--";
					margin: 0 2px;
				}
			}
			.failed td {
				color: red;
			}
			button {
				padding: 0 4px;
			}
		}

		.buttons button {
			text-transform: uppercase;
			cursor: pointer;
			& + button {
				margin-left: 4px;
			}
		}
	</style>
</:head>
<:body>
	<div class="text" &margin="16px 32px">
		<span &font-size="2em" &font-weight=600>Sactory ${version}</span>
		<div class="buttons" &margin-top="4px">
			&bull;&bull;&bull;
			<button +click=testAll>run all</button>
			<button +click={window.location.reload()}>reload</button>
			<button +click={*es6=true} @disabled=*es6>es6</button>
			<button +click={*es6=false} @disabled=!*es6>es5 (transpiled)</button>
		</div>
	</div>
	<table class="container">
		<tr>
			<td width=1 rowspan=2 class="data text border">
				<div &max-height="100%" &overflow-y="auto">
					<table :ref=tests &border-spacing=0>
						<tr>
							<th>Type</th>
							<th>Name</th>
							<th>Time</th>
							<th>Outcome</th>
							<th>Actions</th>
						</tr>
						foreach(data as info) {
							<tr>
								<td ~text=info.type />
								if(info.error) {
									<:element ~class="failed" />
									<td ~text=info.name />
									<td colspan=3>COMPILATION FAILED</td>
								} else {
									var outcome;
									var run = function(){ test(info, outcome) };
									<td><a href=info.name ~text=info.name +click:prevent=run /></td>
									<td>\${format(info.time)}ms</td>
									<td :ref=outcome>NONE</td>
									<td class="buttons">
										<button +click=run>run</button>
										<button +click={source(info)}>source</button>
									</td>
								}
							</tr>
						}
					</table>
				</div>
			</td>
			<td *hide=showSource rowspan=2 class="border">
				<div &padding="8px" &max-height="100%" &overflow-y="auto"><div :ref=container /></div>
			</td>
			<td :ref=sources.upper *show=showSource class="border" />
		</tr>
		<tr>
			<td :ref=sources.lower *show=showSource class="border" />
		</tr>
	</table>
</:body>
`).source.all;

fs.writeFileSync("./_test/index.html", `
	<!DOCTYPE html>
	<html>
		<head>
			<title>Test Suite — Sactory ${version}</title>
			<meta charset="utf-8" />
			<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/codemirror.min.css" />
			<link rel="stylesheet" href="file:///C:/Users/MARCO/Desktop/cm-sactory.css" />
			<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/codemirror.min.js"></script>
			<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/mode/xml/xml.min.js"></script>
			<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/mode/htmlmixed/htmlmixed.min.js"></script>
			<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/mode/css/css.min.js"></script>
			<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/mode/javascript/javascript.min.js"></script>
			<script src="../dist/sactory.min.js"></script>
			<script src="https://cdnjs.cloudflare.com/ajax/libs/require.js/2.3.6/require.min.js"></script>
			<script>define("sactory",function(){return Sactory})</script>
			<script>function assert(condition){if(!condition){throw new Error("Assertion failed.")}}</script>
			<script>window.onload=function(){"use strict";var data=[${data.join(",")}];${source}}</script>
		</head>
	</html>
`);
