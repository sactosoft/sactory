var Util = require("./util");
var Polyfill = require("./polyfill");
var Factory = require("./transpiler");

var version = require("../version");

var Watcher = {
	
	compile: function(folder, dest, watch){
	
		function conv(str) {
			str = str.replace('\\', '/');
			if(!Polyfill.endsWith.call(str, '/')) str += '/';
			return str;
		}
		
		folder = conv(folder);
		if(!dest) dest = folder;
		else dest = conv(dest);
		
		var fs = require("fs");
		var path = require("path");
		
		function update(filename) {
			if(Polyfill.endsWith.call(filename, ".jsb")) {
				console.log("Changes detected to " + folder + filename);
				fs.readFile(folder + filename, function(error, data){
					if(error) {
						console.error(error);
					} else {
						var source = path.relative(dest, folder).replace('\\', '/');
						if(source) source += "/";
						source += filename;
						var namespace = folder + filename;
						var conv;
						try {
							conv = Factory.convertSource(data.toString(), namespace);
						} catch(e) {
							console.error(e);
						}
						if(conv) {
							filename = filename.substring(0, filename.length - 1);
							/*fs.writeFile(dest + filename + ".map", JSON.stringify({
								version: 3,
								sources: [source],
								names: [],
								file: filename
							}), function(error){});*/
							fs.writeFile(dest + filename,
								"/*! This file was automatically generated using Factory v" + version.version + " from '" + source + "'. Do not edit manually! */" +
								/*"Factory.check(" + Util.VERSION_MAJOR + "," + Util.VERSION_MINOR + "," + Util.VERSION_PATCH + ");" +*/ conv,
								function(error){
									
								if(error) {
									console.error(error);
								} else {
									console.log("Converted to " + dest + filename);
								}
							});
							Util.reset(namespace);
						}
					}
				});
			}
		}
		
		fs.readdir(folder, function(error, files){
			if(error) {
				console.error(error);
			} else {
				files.forEach(function(file){
					fs.stat(folder + file, function(error, stat){
						if(error) {
							console.error(error);
						} else if(stat.isFile()) {
							update(file);
						}
					});
				});
			}
		});
		
		if(watch) {
			
			fs.watch(folder, {recursive: true}, function(event, filename){
				update(filename);
			});
			
			console.log("Watching " + folder + "**/*.jsb using " + APP_NAME + " v" + Factory.VERSION);
			
		}
		
	},
	
	watch: function(folder, dest){
		Watcher.compile(folder, dest, true);
	}
	
};

if(typeof process == "object" && process.argv && (process.argv[2] == "compile" || process.argv[2] == "watch")) {
	Watcher[process.argv[2]](process.argv[3], process.argv[4]);
}

module.exports = Watcher;
	