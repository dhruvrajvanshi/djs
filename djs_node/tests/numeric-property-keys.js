const object = {};
object[1] = "first";
console.log(object[1], object["1"]);
object["1"] = "changed";
console.log(object[1]);
