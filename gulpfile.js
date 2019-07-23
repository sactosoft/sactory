var gulp = require("gulp");
var append = require("gulp-append-prepend").appendText;
var prepend = require("gulp-append-prepend").prependText;
var clone = require("gulp-clone");
var concat = require("gulp-concat");
var nop = require("gulp-nop");
var rename = require("gulp-rename");
var replace = require("gulp-replace");
var sourcemaps = require("gulp-sourcemaps");
var uglify = require("gulp-uglify");
var es = require("event-stream");

var version = require("./version");

var debugExp = /\/\* debug:\r?\n([\s\S]*?)\*\//g;

function make(filename, className, sources) {
	var stream = gulp.src(sources.map(function(s){
		return "src/" + s + ".js";
	}))
	.pipe(sourcemaps.init())
	.pipe(concat(filename + ".js"))
	.pipe(replace(/var Sactory = {};?/gm, ""))
	.pipe(replace(/(var {?[a-zA-Z0-9_,\s]+}? = )?require\(\"[a-zA-Z0-9_\-\.\/]*\"\)[a-zA-Z0-9_\.]*;/gm, ""))
	.pipe(replace(/(module\.exports = {?[a-zA-Z0-9_,\s\.]*}?;)/gm, ""))
	.pipe(replace(/(Sactory[A-Z][a-z]+)/gm, className))
	.pipe(prepend(
		"!function(a){if(typeof define == 'function' && define.amd){define(a);}else{window." + className + " = a();}" +
		"}(function(){var toString = function(){return Object.toString().replace(/Object/, '" +  className + "').replace(/native/, 'sactory');};" + className + ".toString = toString.toString = toString;" +
		"function get(prop, value){ Object.defineProperty(" + className + ", prop, {get: function(){ return value; }}); }get('VERSION_MAJOR', " + version.major + ");get('VERSION_MINOR', " + version.minor + ");get('VERSION_PATCH', " + version.patch + ");" +
		"get('VERSION', '" + version.version + "');", Object("")
	))
	.pipe(append("return " + className + ";});", Object("")));

	var debug = stream.pipe(clone())
		.pipe(replace(debugExp, "/* debug: */\n$1"))
		.pipe(rename(filename + ".debug.js"))
		.pipe(sourcemaps.write("."))
		.pipe(gulp.dest("dist"));
	
	var dist = stream.pipe(clone())
		.pipe(sourcemaps.write("."))
		.pipe(gulp.dest("dist"));

	var ugly = stream.pipe(clone())
		.pipe(uglify({mangle: true}))
		.pipe(rename(filename + ".min.js"))
		.pipe(sourcemaps.write("."))
		.pipe(gulp.dest("dist"));

	return es.merge(debug, dist, ugly).pipe(nop());
}

gulp.task("dist:sactory", function(){
	return make("sactory", "Sactory", [
		"polyfill",
		"const",
		"util",
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
