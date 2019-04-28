var gulp = require("gulp");
var concat = require("gulp-concat");
var footer = require("gulp-footer");
var header = require("gulp-header");
var rename = require("gulp-rename");
var replace = require("gulp-replace");
var uglify = require("gulp-uglify");

function make(filename, className, sources) {
	return gulp.src(sources.map(function(s){
		return "src/" + s + ".js";
	}))
	.pipe(concat(filename + ".js"))
	.pipe(replace(/var Factory = {};/gm, ""))
	.pipe(replace(/var [a-zA-Z0-9_]+ = require\(\"[a-zA-Z0-9_\-\.\/]*\"\);/gm, ""))
	.pipe(replace(/module\.exports = [a-zA-Z0-9_\.]*;/gm, ""))
	.pipe(replace(/Common/gm, "Factory"))
	.pipe(header("!function(a){\n\tif(typeof define == 'function' && define.amd) {\n\t\tdefine(a);\n\t} else {\n\t\twindow." + className + " = a();\n\t}\n}(function(){\n\nfunction Factory(){};\nFactory.toString = function(){return Object.toString().replace(/Object/, '" +  className + "').replace(/native/, 'factory');};\n\n"))
	.pipe(footer("\nreturn Factory;\n\n});"))
	.pipe(gulp.dest("dist"))
	.pipe(uglify())
	.pipe(rename(filename + ".min.js"))
	.pipe(gulp.dest("dist"));
}

gulp.task("dist-factory", function(){
	return make("factory", "Factory", [
		"factory",
		"polyfill",
		"runtime/common",
		"runtime/builder",
		"runtime/client"
	]);
});

gulp.task("dist-transpiler", function(){
	return make("transpiler", "FactoryTranspiler", [
		"factory",
		"polyfill",
		"parser",
		"transpiler"
	]);
});

gulp.task("dist", gulp.parallel("dist-factory", "dist-transpiler"));
