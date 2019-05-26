var fs = require("fs");

var tests = {};

fs.readdirSync("./unittest/").forEach(name => {
	var test = {
		content: {
			js: "",
			html: "",
			css: ""
		},
		mode: {
			js: "code",
			html: "html:logic",
			css: "cssb"
		},
		show: {
			js: false,
			html: false,
			css: false
		}
	};
	["js", "html", "css"].forEach(type => {
		try {
			var path = "./unittest/" + name + "/index." + type + "b";
			fs.statSync(path);
			test.content[type] = fs.readFileSync(path, "utf8");
			test.show[type] = true;
			tests[name] = test;
		} catch(e) {}
	});
});

var index = "<script>\n";

for(var key in tests) {
	index += "\twindow.localStorage.setItem('storage.unittest@" + key + "', " + JSON.stringify(JSON.stringify(tests[key])) + ");\n";
}

index += "window.location='../test/sandbox.html'</script>";

fs.writeFileSync("./unittest/index.html", index);
