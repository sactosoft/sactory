var gulp = require("gulp");
var concat = require("gulp-concat");
var footer = require("gulp-footer");
var header = require("gulp-header");
var rename = require("gulp-rename");
var replace = require("gulp-replace");
var uglify = require("gulp-uglify");

var version = require("./version");

function make(filename, className, sources) {
	return gulp.src(sources.map(function(s){
		return "src/" + s + ".js";
	}))
	.pipe(concat(filename + ".js"))
	.pipe(replace(/var Sactory = {};/gm, ""))
	.pipe(replace(/(var [a-zA-Z0-9_]+ = )?require\(\"[a-zA-Z0-9_\-\.\/]*\"\);/gm, ""))
	.pipe(replace(/module\.exports = [a-zA-Z0-9_\.]*;/gm, ""))
	.pipe(replace(/(Util|SactoryObservable|SactoryBind)/gm, "Sactory"))
	.pipe(header(
		"!function(a){\n\tif(typeof define == 'function' && define.amd) {\n\t\tdefine(a);\n\t} else {\n\t\twindow." + className + " = a();\n\t}\n" +
		"}(function(){\n\nfunction Sactory(){};\nvar toString = function(){return Object.toString().replace(/Object/, '" +  className + "').replace(/native/, 'sactory');};\nSactory.toString = toString.toString = toString;\n" +
		"function get(prop, value){ Object.defineProperty(Sactory, prop, {get: function(){ return value; }}); }\nget('VERSION_MAJOR', " + version.major + ");\nget('VERSION_MINOR', " + version.minor + ");\nget('VERSION_PATCH', " + version.patch + ");\n" +
		"get('VERSION', '" + version.version + "');\n\n"
	))
	.pipe(footer("\nreturn Sactory;\n\n});"))
	.pipe(gulp.dest("dist"))
	.pipe(uglify({mangle: false}))
	.pipe(rename(filename + ".min.js"))
	.pipe(gulp.dest("dist"));
}

gulp.task("dist:sactory", function(){
	return make("sactory", "Sactory", [
		"polyfill",
		"runtime/core",
		"runtime/cssb",
		"runtime/bind",
		"runtime/observable",
		"runtime/builder",
		"runtime/client"
	]);
});

gulp.task("dist:sactory-lite", function(){
	return make("sactory-lite", "Sactory", [
		"util",
		"polyfill",
		"runtime/core",
		"runtime/observable",
		"runtime/builder",
		"runtime/client"
	]);
});

gulp.task("dist:transpiler", function(){
	return make("transpiler", "SactoryTranspiler", [
		"util",
		"polyfill",
		"parser",
		"transpiler"
	]);
});

gulp.task("dist", gulp.parallel("dist:sactory", "dist:sactory-lite", "dist:transpiler"));
