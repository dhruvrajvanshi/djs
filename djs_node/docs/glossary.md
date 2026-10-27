
# Glossary

We try to follow the [ECMAScript specification](https://tc39.es/ecma262/)
(ECMA-262) closely, and the code uses its terms.

| Term | Meaning | Example |
| --- | --- | --- |
| **Realm** | The builtin objects a program runs with | `Array`, `%Array.prototype%`, `TypeError` |
| **Well-known intrinsic** | A builtin object the spec refers to by a name in percent signs. Each realm has one of each. These docs also call them well-known objects | `%Array.prototype%` is the object a program sees as `Array.prototype` |
| **Abstract operation** | A helper algorithm in the spec. Programs can't call it by name | `ToPrimitive` |
| **Internal slot** | Hidden state stored on an object, written in double brackets. Programs can't see it as a property | `[[Prototype]]`, `[[StringData]]` |
| **Internal method** | An operation every object supports, such as defining a property. Most objects share the default version | `[[DefineOwnProperty]]` |
| **Exotic object** | An object with its own version of some internal methods ([object-model.md](object-model.md#internal-methods-and-exotic-objects)) | An array, whose `length` grows with its elements |
| **Built-in function** | A function the engine provides, written from the steps in the spec | `Array ( ...values )` |
