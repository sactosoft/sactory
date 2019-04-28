var express = require("express");

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
				@ = document.body;
				<h3 data-working @text="It's working!" />
			</script>
		</head>
	`);
});

require("./src/user")(app);

app.listen(port, console.log);
