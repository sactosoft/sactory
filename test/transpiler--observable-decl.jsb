var a = &;
var a = &0;
var c = &"string";
var d = &window.document.documentElement;
var e = & => 1;
var f = & => *a + *a + *a;
var g = & => { return *?a + 1 };
var h = (&) => *a + 1;
var i = (&) => { return *a + 1 };
var j = function(&){ return *a + 1 };
var k = function name(&){ return *a + 1 };
//var l = function functionName(&){ return *a + 1 };

// async
var m = async & => *a + 1;
var n = async (&) => *a + 1;
var o = async function(&){ return *a + 1 };
var p = async function name(&){ return *a + 1 };
