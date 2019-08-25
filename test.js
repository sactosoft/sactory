var fs = require("fs");

var { version } = require("./version");
var { transpile } = require("./transpiler");

var { transform } = require("babel-core");

var data = [];

// heat up
transpile({}, "var section = <section />;");

fs.readdirSync("./test/").forEach(name => {
	var info = name.slice(0, -4).split("--");
	var source = fs.readFileSync("./test/" + name, "utf8");
	var error, result = {};
	try {
		result = transpile({filename: name, mode: "auto-code@logic", versionCheck: false, env: ["none", "amd"], es6: true, bind: "__bind"}, source);
	} catch(e) {
		error = e;
	}
	data.push({type: info[0], name: info[1], source, error, result});
});

var babel = source => {
	return transform(source, {presets: [["babel-preset-env", {modules: false}]]}).code;
};

var encode = tr => data.map(({type, name, source, error, result}) =>
	`{type:"${type}",name:"${name}",source:${JSON.stringify(source)},error:${JSON.stringify(error)},time:${Math.round(result.time * 1000) / 1000},` +
	`content:${result.source && JSON.stringify(result.source.contentOnly)},fun:function(__bind){${result.source && (tr ? babel(result.source.all) : result.source.all)}}}`);

var source = transpile({mode: "auto-code@logic,trimmed"}, `
var tests, container, sources = {}, editors;
var bind, showSource = **false;

function test(info, outcome) {
	if(bind) bind.rollback();
	bind = Sactory.bindFactory.fork();
	bind.name = "test";
	<:use (outcome) @textContent="RUNNING" />
	try {
		info.fun.call(<:use (container) :clear />, bind);
		*showSource = false;
		<:use (outcome) :clear><span &color="green" ~text="SUCCESS" /></:use>
	} catch(error) {
		<:use (outcome) :clear><span &color="red" ~text="FAILED" /></:use>
		console.error(error);
	}
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
	var width = container.offsetWidth;
	var height = container.offsetHeight;
	setTimeout(function(){
		var editor = editors[name] = new CodeMirror(container, {
			value: source,
			mode: "javascript",
			lineNumbers: true,
			lineWrapping: true
		});
		editor.setSize(width, height);
	});
}

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
			<button +click={window.location="test-es6.html"}>es6</button>
			<button +click={window.location="test-es5.html"}>es5 (transpiled)</button>
		</div>
	</div>
	<table class="container">
		<tr>
			<td width=1 rowspan=2 class="data text border">
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
								<td>\${info.time}ms</td>
								<td :ref=outcome>NONE</td>
								<td class="buttons">
									<button +click=run>run</button>
									<button +click={source(info)}>source</button>
								</td>
							}
						</tr>
					}
				</table>
			</td>
			<td *hide=showSource rowspan=2 class="border">
				<div &padding="8px" &overflow-y="auto"><div :ref=container /></div>
			</td>
			<td *show=showSource class="border">
				<div :ref=sources.upper &width="100%" &height="100%" />
			</td>
		</tr>
		<tr>
			<td *show=showSource class="border">
				<div :ref=sources.lower &width="100%" &height="100%" />
			</td>
		</tr>
	</table>
</:body>
`).source.all;

[[6, false], [5, true]].forEach(([es, tr]) => {
	fs.writeFileSync(`./test-es${es}.html`, `
		<!DOCTYPE html>
		<html>
			<head>
				<title>Test Suite (ES${es}) — Sactory ${version}</title>
				<meta charset="utf-8" />
				<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/codemirror.min.css">
				<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/codemirror.min.js"></script>
				<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/mode/xml/xml.min.js"></script>
				<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/mode/htmlmixed/htmlmixed.min.js"></script>
				<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/mode/css/css.min.js"></script>
				<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/mode/javascript/javascript.min.js"></script>
				<script src="./dist/sactory.min.js"></script>
				<script>window.onload = function(){"use strict";var data = [${encode(tr)}];${source}}</script>
			</head>
		</html>
	`);
});
