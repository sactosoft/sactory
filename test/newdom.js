
require("../src/dom");
var document = new Document();

var element = document.createElement("div");
element.textContent = "Hello <>";
element.setAttribute("title", "Some title");

var comment = document.createComment(" just a test comment ");
element.appendChild(comment);

var input = document.createElement("input");
input.id = "input";
input.value = "default value";
element.appendChild(input);

var section = document.createElement("section");
section.className = "section container";
section.textContent = "Section: ";
section.style.padding = "8px";
section.style.paddingLeft = "12px";
section.style.border = "1px solid silver";
section.dataset.name = "section";
element.appendChild(section);

["facebook", "twitter", "youtube"].forEach(type => {
	var a = document.createElement("a");
	a.setAttribute("href", "/" + type);
	a.setAttribute("target", "_blank");
	a.textContent = type;
	section.appendChild(a);
});

console.log(document.querySelectorAll("section.container a, input[type='test\\'more']"));
console.log(element.render());
