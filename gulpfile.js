var gulp = require("gulp");
var append = require("gulp-append-prepend").appendText;
var prepend = require("gulp-append-prepend").prependText;
var babel = require("gulp-babel");
var clone = require("gulp-clone");
var concat = require("gulp-concat");
var nop = require("gulp-nop");
var rename = require("gulp-rename");
var replace = require("gulp-replace");
var sourcemaps = require("gulp-sourcemaps");
var uglify = require("gulp-uglify-es").default;
var es = require("event-stream");

var { version } = require("./version");

var nos = Object("");
var debugExp = /\/\* debug:\r?\n([\s\S]*?)\*\//g;

function make(filename, className, sources) {

	var header = `var toString=function(){return Object.toString().replace(/Object/,'${className}').replace(/native/,'sactory');};${className}.toString=toString.toString=toString;Object.defineProperty(${className},'VERSION',{value:'${version}'});`;
	var reserved = [className, "Widget", "Builder", "Bind", "Observable", "Color", "RGBColor", "HSLColor", "Parser", "ParserError"];

	var stream = gulp.src(sources.map(s => "src/" + s + ".js"))
		.pipe(sourcemaps.init())
		.pipe(concat(filename + ".js"))
		.pipe(replace(/var Sactory = {};?/gm, ""))
		.pipe(replace(/(var {?[a-zA-Z0-9_,\s]+}? = )?require\(\"[a-zA-Z0-9_\-\.\/]*\"\)[a-zA-Z0-9_\.]*;/gm, ""))
		.pipe(replace(/(module\.exports = {?[a-zA-Z0-9_,\s\.]*}?;)/gm, ""))
		.pipe(replace(/(Sactory[A-Z][a-z]+)/gm, className))

	var module = stream.pipe(clone())
		.pipe(prepend(header, nos));

	var modulePretty = module.pipe(clone())
		.pipe(append(`export default ${className};`, nos))
		.pipe(rename(filename + ".module.js"))
		.pipe(sourcemaps.write("./maps"))
		.pipe(gulp.dest("dist"));

	var moduleUgly = module.pipe(clone())
		.pipe(uglify({mangle: {toplevel: true, reserved}}))
		.pipe(append(`export default ${className};`, nos))
		.pipe(rename(filename + ".module.min.js"))
		.pipe(sourcemaps.write("./maps"))
		.pipe(gulp.dest("dist"));

	var amd = stream.pipe(clone())
		.pipe(prepend(`!function(a){if(typeof define=='function'&&define.amd){define(a);}else{window.${className}=a();}}(function(){${header}`, nos))
		.pipe(append(`return ${className};});`, nos));

	var amdPretty = amd.pipe(clone())
		.pipe(sourcemaps.write("./maps"))
		.pipe(gulp.dest("dist"));

	var amdDebug = amd.pipe(clone())
		.pipe(replace(debugExp, "/* debug: */\n$1"))
		.pipe(rename(filename + ".debug.js"))
		.pipe(sourcemaps.write("./maps"))
		.pipe(gulp.dest("dist"));

	var amdUgly = amd.pipe(clone())
		.pipe(babel({
			presets: ["babel-preset-env", ["babel-preset-minify", {
				builtIns: false,
				mangle: {exclude: reserved}
			}]],
			minified: true,
			comments: false
		}))
		.pipe(rename(filename + ".min.js"))
		.pipe(sourcemaps.write("./maps"))
		.pipe(gulp.dest("dist"));

	return es.merge(modulePretty, moduleUgly, amdPretty, amdDebug, amdUgly).pipe(nop());

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
		"runtime/context",
		"runtime/core",
		"runtime/client",
		"runtime/observable",
		"runtime/style",
		"runtime/widget"
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
