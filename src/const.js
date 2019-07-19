var Const = {};

function def(key, value) {
	Object.defineProperty(Const, key, {
		value: value
	});
}

// argument type for update
def("ARG_TYPE_WIDGET", 0);
def("ARG_TYPE_NAMESPACE", 1);
def("ARG_TYPE_ATTRIBUTES", 2);
def("ARG_TYPE_INTERPOLATED_ATTRIBUTES", 3);
def("ARG_TYPE_SPREAD", 4);
def("ARG_TYPE_TRANSITIONS", 5);

// attribute type for builder
def("BUILDER_TYPE_NONE", 0);
def("BUILDER_TYPE_PROP", 1);
def("BUILDER_TYPE_CONCAT", 2);
def("BUILDER_TYPE_ON", 3);
def("BUILDER_TYPE_WIDGET", 4);
def("BUILDER_TYPE_EXTEND_WIDGET", 5);

// update types for observable
def("OBSERVABLE_UPDATE_TYPE_ARRAY_PUSH", 1048571);
def("OBSERVABLE_UPDATE_TYPE_ARRAY_POP", 1048572);
def("OBSERVABLE_UPDATE_TYPE_ARRAY_UNSHIFT", 1048573);
def("OBSERVABLE_UPDATE_TYPE_ARRAY_SHIFT", 1048574);
def("OBSERVABLE_UPDATE_TYPE_ARRAY_SPLICE", 1048575);
def("OBSERVABLE_UPDATE_TYPE_FORM_RANGE_START", 1048576);
def("OBSERVABLE_UPDATE_TYPE_FORM_RANGE_LENGTH", 1048576);

module.exports = Const;