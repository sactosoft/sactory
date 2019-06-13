var express = require("express");
var Sactory = global.Sactory = require("..");

var app = express();
var port = 3000;

app.use("/dist", express.static("./dist"));
app.use("/test-dist", express.static("./test/dist"));

app.get('/', function(req, res){
	res.send(`
		<head>
			<meta charset="UTF-8" />
			<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/codemirror.min.css" />
			<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/codemirror.min.js"></script>
			<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/mode/xml/xml.min.js"></script>
			<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/mode/htmlmixed/htmlmixed.min.js"></script>
			<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/mode/css/css.min.js"></script>
			<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.46.0/mode/javascript/javascript.min.js"></script>
			<script src="/dist/transpiler.js"></script>
			<script src="/dist/sactory.js"></script>
			<script src="/test-dist/client/sandbox.js"></script>
		</head>
	`);
});

require("./dist/server/user")(app);

app.listen(port, console.log);
