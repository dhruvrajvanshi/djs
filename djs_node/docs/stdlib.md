# Writing builtins

Builtins live in [`stdlib/js/`](../stdlib/js/). Each one is written to read
like its section of the [spec](https://tc39.es/ecma262/), with the help of a
few **declaration markers** imported from `djs:native`. This page walks
through a builtin module, explains each marker, and points to the compiler and
VM code that handles it.

## A builtin, annotated

This is [`array.js`](../stdlib/js/array.js), shortened:

```js
import {
  well_known,
  slot,
  internal_method,
  attributes,
  create_builtin_function,
  array_create,
} from "djs:native"
import { ObjectPrototype, FunctionPrototype } from "./fundamental.js"

// 23.1.1 The Array Constructor
const Array = well_known("%Array%", create_builtin_function, {         // (1)
  [slot("[[Prototype]]")]: FunctionPrototype,                          // (2)

  // 23.1.1.1 Array ( ...values )
  [internal_method("[[Call]]", "[[Construct]]")]: function Array(...values) {   // (3)
    const prototype = get_prototype_from_constructor(new.target ?? Array, ArrayPrototype)
    …
  },

  // 23.1.2 Properties of the Array Constructor
  isArray(value) { … },                                                // (4)
  prototype: attributes({ writable: false, configurable: false }, ArrayPrototype),   // (5)
})

// 23.1.3 Properties of the Array Prototype Object
const ArrayPrototype = well_known("%Array.prototype%", array_create, {   // (6)
  [slot("[[Prototype]]")]: ObjectPrototype,
  constructor: Array,
  values() { … },
  [Symbol.iterator]: ArrayPrototype.values,                            // (7)
})

// 10.4.2.1 [[DefineOwnProperty]] ( P, Desc )
function array_define_own_property(P, Desc) { … }
internal_method("array", "[[DefineOwnProperty]]", array_define_own_property)       // (8)

export default Array
```

1. `well_known("%Array%", create_builtin_function, { … })` declares the
   well-known intrinsic `%Array%`: it's created as a built-in function, then
   given the contents of the literal.
2. `[slot("[[Prototype]]")]: …` sets an internal slot. The object gets no
   property for it.
3. `internal_method("[[Call]]", "[[Construct]]")` makes `%Array%` a built-in
   constructor. This function holds what it does when called.
4. Plain methods and properties become properties of the object, with the
   spec's default attributes for builtins.
5. `attributes(…)` overrides those attributes for one property.
6. `%Array.prototype%` is created with `array_create`, so it is an array
   itself, as the spec requires.
7. A member can read properties defined earlier in the same literal.
8. A module-level statement registers `array_define_own_property` as the
   `[[DefineOwnProperty]]` of every array.

The rest of this page explains each part.

## How markers work

The markers are `well_known`, `slot`, `internal_method`, `attributes` and
`abstract_operation`. They are written as function calls so
the stdlib stays valid JavaScript, which editors and prettier can handle. The
compiler finds them by their import from `djs:native` (`native_import` and
`marker_call` in [compiler/compile.ts](../compiler/compile.ts)) and turns each
one into something else, described below. They never run.

You can only use them in the positions shown on this page, and their
arguments must be written out directly: string literals, object literals, and
the names of functions or native operations. Using a marker anywhere else is a
compile error, for example "well_known declares the realm and is never
evaluated".

## `well_known`: declaring a builtin object

```js
const ArrayPrototype = well_known("%Array.prototype%", array_create, { … })
```

It takes three arguments:

1. The spec's name for the object, percent signs included.
2. The native operation that creates the object. Each one implements a spec
   creation algorithm:

   | Operation | Spec | Creates |
   | --- | --- | --- |
   | `ordinary_object_create` | [OrdinaryObjectCreate](https://tc39.es/ecma262/#sec-ordinaryobjectcreate) | An ordinary object, such as `%Object.prototype%` |
   | `create_builtin_function` | [CreateBuiltinFunction](https://tc39.es/ecma262/#sec-createbuiltinfunction) | A built-in function, such as `%Array%` |
   | `array_create` | [ArrayCreate](https://tc39.es/ecma262/#sec-arraycreate) | An array, such as `%Array.prototype%` |
   | `string_create` | [StringCreate](https://tc39.es/ecma262/#sec-stringcreate) | A `String` object, such as `%String.prototype%` |

   You name the operation without calling it. Before any stdlib code runs,
   the realm creates the object the same way that operation would, with empty
   values: no prototype, length 0, the empty string.
3. An object literal with the object's contents. Anything the creation
   operation would normally take as an argument, like the prototype, is given
   here as a slot.

The call must be the whole initializer of a module-level `const`.

What this means when you write a builtin:

- **Every well-known object exists before any stdlib code runs.** So builtins
  can refer to each other in any order, including in cycles such as
  `Array.prototype.constructor === Array`.
- **Its contents are filled in when its module runs,** member by member, in
  source order. Reading another builtin's properties before its module has run
  finds them missing.

[realm.md](realm.md) explains how this works: the compiler records each
declaration (`declare_well_known` in
[compiler/compile.ts](../compiler/compile.ts)), `create_realm` creates the
objects, and the compiled literal fills them (`fill_well_known`).

### Members

Inside the literal, each member is one of:

| Member | Becomes | Compiled by |
| --- | --- | --- |
| `name: value`, `name() { … }`, `get name() { … }` | A property with the default attributes below | `fill_entry` |
| `name: attributes({ … }, value)` | A property with the given attributes | `fill_entry`, `attribute_flags` |
| `[slot("[[Name]]")]: value` | The internal slot `[[Name]]` | `fill_entry`, then the `INIT_SLOT` instruction |
| `[internal_method("[[Call]]"…)]: function Name(…) { … }` | The object's built-in function steps | `fill_entry`, then the `SET_BEHAVIOR` instruction |

**Default attributes.** Builtin properties use the attributes from clause 18
of the spec,
[ECMAScript Standard Built-in Objects](https://tc39.es/ecma262/#sec-ecmascript-standard-built-in-objects).
Unlike in a normal object literal, they are not enumerable:

| Property | Writable | Enumerable | Configurable |
| --- | --- | --- | --- |
| Data property | yes | no | yes |
| Accessor property | — | no | yes |
| `length` and `name` of a built-in function | no | no | yes |

Use `attributes({ writable, enumerable, configurable }, value)` only where the
spec lists other values, such as `Array.prototype`'s
`{ [[Writable]]: false, [[Configurable]]: false }`.

**Slots.** `[slot("[[Prototype]]")]: X` sets the object's prototype. Any
other name adds that hidden slot to the object, which code can read later with
`get_slot` ([native-operations.md](native-operations.md#internal-slots)).

### Built-in functions

```js
[internal_method("[[Call]]", "[[Construct]]")]: function Array(...values) { … }
```

A well-known object created with `create_builtin_function` needs exactly one
member like this; other objects can't have one. The function expression holds
what the
[built-in function](https://tc39.es/ecma262/#sec-built-in-function-objects)
does when called. Use `"[[Call]]"`
alone for a function that can't be used with `new` (like
`%Function.prototype%`), and both for a constructor.

| | `"[[Call]]"`: called as `Array(1, 2)` | `"[[Construct]]"`: called as `new Array(1, 2)` |
| --- | --- | --- |
| `this` | The receiver of the call | `undefined`; the steps create the new object themselves |
| `new.target` | `undefined` | The constructor being invoked |
| Result | The return value | The return value, which must be the new object |

The spec does the same: it gives each built-in function one algorithm, which
checks NewTarget to tell the two cases apart ("If NewTarget is undefined, let
newTarget be the active function object"). In the code, that's
`new.target ?? Array`.

Other details:

- The function expression doesn't become a property. The VM stores it on the
  well-known object ([object-model.md](object-model.md#built-in-functions)
  explains how).
- The object's `name` is the function expression's name, or `""` if it has
  none. Its `length` comes from the parameter list, so write parameters to
  match the spec's `length`: give optional parameters defaults.
- Inside the function, its name refers to the well-known object: `Array` in
  the body above is `%Array%`.

### Exotic objects

The spec says "%Array.prototype% is an Array exotic object". Declaring it with
`array_create` makes it one: it is created as an array and behaves like one.
[object-model.md](object-model.md#internal-methods-and-exotic-objects)
explains arrays and `String` objects.

## Functions the VM calls

The VM calls some stdlib functions itself. These are normal function
declarations, each followed by a module-level statement that tells the VM
what it is:

```js
// 7.1.1 ToPrimitive ( input [ , preferredType ] )
export function to_primitive(value, hint) { … }
abstract_operation("ToPrimitive", to_primitive)

// 10.4.2.1 [[DefineOwnProperty]] ( P, Desc )
function array_define_own_property(P, Desc) { … }
internal_method("array", "[[DefineOwnProperty]]", array_define_own_property)
```

| Statement | Declares |
| --- | --- |
| `abstract_operation("Name", fn)` | `fn` implements the spec abstract operation `Name` |
| `internal_method(kind, "[[X]]", fn)` | `fn` is the internal method `[[X]]` of every object of `kind`; `this` is the object |

The compiler records these in `declare_registration`.
[realm.md](realm.md#what-the-vm-uses) lists every function the VM calls, when
it calls it, and with which arguments.

## Conventions

- **Spec references.** Put the section number and title in a comment above
  each declaration and algorithm, as in the example.
- **Abstract operations** go in [`abstract.js`](../stdlib/js/abstract.js)
  (`djs:abstract`), named after the spec in snake case:
  `to_integer_or_infinity` is
  [ToIntegerOrInfinity](https://tc39.es/ecma262/#sec-tointegerorinfinity).
  Helpers that are not spec operations go in
  [`support.js`](../stdlib/js/support.js).
- **Variadic functions.** Take the values with a rest parameter, as in
  `push(...values)`. A rest parameter doesn't count toward `length`, so these
  functions currently have a smaller `length` than the spec says
  (`Array.prototype.push.length` is 0, not 1). Read `arguments.length` only to
  tell whether an optional argument was passed, as the spec does with "if x is
  present".
- **Calling functions.** Use `call(f, thisValue, …args)` from `djs:native`,
  the spec's [Call](https://tc39.es/ecma262/#sec-call). A program can
  overwrite `f.call`, so `f.call(…)` might run something else.
- **Hidden state.** If the spec names it as a slot (`[[PromiseState]]`), use a
  slot. Otherwise a private class field is fine.
- **Not converted yet.** [`iteration.js`](../stdlib/js/iteration.js) is still
  written as classes. It predates the markers; new builtins should use
  `well_known`.
- **No import cycles.** If two builtins need each other, put them in the same
  module.
  [`fundamental.js`](../stdlib/js/fundamental.js) holds `%Object%`,
  `%Object.prototype%` and `%Function.prototype%` together, because `%Object%`
  inherits from `%Function.prototype%`, which inherits from
  `%Object.prototype%`. It is named after spec clause 20, Fundamental Objects.

## Adding a builtin

1. Write its well-known objects in a module under `stdlib/js/`, one
   declaration per spec section, with section comments.
2. If it is a global, export it from [`realm.js`](../stdlib/js/realm.js).
3. If the VM needs it, add its name to `REQUIRED` in
   [runtime/realm.ts](../runtime/realm.ts) and follow the checklist in
   [realm.md](realm.md#adding-something-the-vm-uses).
4. Add tests in `e2e/` that run a program and check its output. For example,
   [`e2e/array_string.test.js`](../e2e/array_string.test.js) runs the same code
   in Node and compares the results.
