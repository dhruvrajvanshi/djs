function retain(first, ...items) { return () => items }
const saved = retain(null, { value: "retained" }, 2);
const object = { ["method" + 1](value, optional = undefined) { return value } };
console.log(saved()[0].value, saved().length, object.method1.name, object.method1.length);
saved()[3] = 4;
console.log(saved().length, saved()[3]);
