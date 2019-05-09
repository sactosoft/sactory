var express = require("express");
var Sactory = global.Sactory = require("..");

var app = express();
var port = 3000;

app.use("/dist", express.static("dist"));

app.get('/', function(req, res){
	res.send(`
		<head>
			<title>test</title>
			<script src='/dist/factory.js'></script>
			<script src='/dist/transpiler.js'></script>
			<script type='text/x-builder'>
				<div *body>
					<h3 data-working @text="It's working!" />
				</div>
			</script>
		</head>
	`);
});

require("./dist/server/user")(app);

app.listen(port, console.log);
