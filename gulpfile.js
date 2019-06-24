var gulp = require("gulp");
var clone = require("gulp-clone");
var concat = require("gulp-concat");
var footer = require("gulp-footer");
var header = require("gulp-header");
var nop = require("gulp-nop");
var rename = require("gulp-rename");
var replace = require("gulp-replace");
var uglify = require("gulp-uglify");
var es = require("event-stream");

var version = require("./version");

var debugExp = /\/\* debug:\r?\n([\s\S]*?)\*\//g;

function make(filename, className, sources) {
	var stream = gulp.src(sources.map(function(s){
		return "src/" + s + ".js";
	}))
	.pipe(concat(filename + ".js"))
	.pipe(replace(/var Sactory = {};?/gm, ""))
	.pipe(replace(/(var [a-zA-Z0-9_]+ = )?require\(\"[a-zA-Z0-9_\-\.\/]*\"\)[a-zA-Z0-9_\.]*;/gm, ""))
	.pipe(replace(/module\.exports = [a-zA-Z0-9_\.]*;/gm, ""))
	.pipe(replace(/(Sactory[A-Z][a-z]+)/gm, className))
	.pipe(header(
		"!function(a){\n\tif(typeof define == 'function' && define.amd) {\n\t\tdefine(a);\n\t} else {\n\t\twindow." + className + " = a();\n\t}\n" +
		"}(function(){\n\nvar toString = function(){return Object.toString().replace(/Object/, '" +  className + "').replace(/native/, 'sactory');};\n" + className + ".toString = toString.toString = toString;\n" +
		"function get(prop, value){ Object.defineProperty(" + className + ", prop, {get: function(){ return value; }}); }\nget('VERSION_MAJOR', " + version.major + ");\nget('VERSION_MINOR', " + version.minor + ");\nget('VERSION_PATCH', " + version.patch + ");\n" +
		"get('VERSION', '" + version.version + "');\n\n"
	))
	.pipe(footer("\nreturn " + className + ";\n\n});"));

	var debug = stream.pipe(clone())
		.pipe(replace(debugExp, "$1"))
		.pipe(rename(filename + ".debug.js"))
		.pipe(gulp.dest("dist"));
	
	var dist = stream.pipe(clone())
		.pipe(replace(debugExp, ""))
		.pipe(gulp.dest("dist"))
		.pipe(uglify({mangle: true}))
		.pipe(rename(filename + ".min.js"))
		.pipe(gulp.dest("dist"));

	return es.merge(debug, dist).pipe(nop());
}

gulp.task("dist:sactory", function(){
	return make("sactory", "Sactory", [
		"polyfill",
		"const",
		"runtime/config", // must be first
		"runtime/animation",
		"runtime/bind",
		"runtime/builder",
		"runtime/core",
		"runtime/client",
		"runtime/observable",
		"runtime/style"
	]);
});

gulp.task("dist:transpiler", function(){
	return make("transpiler", "Transpiler", [
		"polyfill",
		"const",
		"parser",
		"transpiler"
	]);
});

gulp.task("dist", gulp.parallel("dist:sactory", "dist:transpiler"));
