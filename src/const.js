var Const = {};

var def = (key, value) => Object.defineProperty(Const, key, {value});

def("BUILDER_TYPE_NONE", 0);
def("BUILDER_TYPE_PROP", 1);
def("BUILDER_TYPE_STYLE", 2);
def("BUILDER_TYPE_CONCAT", 3);
def("BUILDER_TYPE_ON", 4);
def("BUILDER_TYPE_WIDGET", 5);
def("BUILDER_TYPE_UPDATE_WIDGET", 6);
def("BUILDER_TYPE_EXTEND_WIDGET", 7);

module.exports = Const;
