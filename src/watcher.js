var Polyfill = require("./polyfill");
var Transpiler = require("./transpiler");

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
						var rfolder, rname, i = filename.lastIndexOf('/');
						if(i == -1) {
							rfolder = "";
							rname = filename;
						} else {
							rfolder = filename.substring(0, i);
							rname = filename.substr(i + 1);
						}
						var source = path.relative(dest + rfolder, folder + rfolder).replace(/\\/g, '/');
						if(source) source += "/";
						source += rname;
						var namespace = folder + filename;
						var conv;
						try {
							conv = new Transpiler().transpile(data.toString(), {filename: namespace, namespace: namespace});
						} catch(e) {
							console.error(e);
						}
						if(conv) {
							var destFilename = dest + filename.substring(0, filename.length - 1);
							var destFolder = destFilename.substring(0, destFilename.lastIndexOf('/'));
							function save() {
								fs.writeFile(destFilename, conv.source.all, function(error){
									if(error) {
										console.error(error);
									} else {
										console.log("Converted to " + dest + filename + " in " + Math.round(conv.time * 1000) / 1000 + " ms");
									}
								});
							}
							fs.access(destFolder, fs.constants.F_OK, function(error){
								if(error) {
									fs.mkdir(destFolder, {recursive: true}, function(error){
										if(error) {
											console.error(error);
										} else {
											save();
										}
									});
								} else {
									save();
								}
							});
						}
					}
				});
			}
		}
		
		function read(currFolder) {
			fs.readdir(folder + currFolder, function(error, files){
				if(error) {
					console.error(error);
				} else {
					files.forEach(function(file){
						var currFile = (currFolder && currFolder + '/') + file;
						fs.stat(folder + currFile, function(error, stat){
							if(error) {
								console.error(error);
							} else if(stat.isFile()) {
								update(currFile);
							} else if(stat.isDirectory()) {
								read(currFile);
							}
						});
					});
				}
			});
		}
		read("");
		
		if(watch) {
			
			fs.watch(folder, {recursive: true}, function(event, filename){
				update(filename);
			});
			
			console.log("Watching " + folder + "**/*.jsb using Sactory v" + version.version);
			
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
	