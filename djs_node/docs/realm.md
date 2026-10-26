# The realm

A **realm** is the set of builtin objects a program runs with:
`%Object.prototype%`, `%Array%`, `%TypeError%` and so on. This page explains
how djs_node builds the realm from the stdlib, and lists every place where the
VM uses it.

## Two steps: allocate, then fill

The builtins refer to each other in circles. `Array.prototype.constructor` is
`Array`, and `Array.prototype` is a property of `Array`. `%Object%` inherits
from `%Function.prototype%`, which inherits from `%Object.prototype%`. Whichever
of these is created first would need the others to exist already.

So, like the spec's
[CreateIntrinsics](https://tc39.es/ecma262/#sec-createintrinsics) (9.3.2),
djs_node builds the realm in two steps:

1. **Allocate** every well-known object, empty, before any stdlib code runs.
2. **Fill** in each object's properties when its module is evaluated.

## Step by step

All of this happens in `bootstrap` ([runtime/bootstrap.ts](../runtime/bootstrap.ts)).

**1. Load the stdlib.** `load_module(runtime, REALM)` loads
[`stdlib/js/realm.js`](../stdlib/js/realm.js) and every module it imports,
directly or indirectly, and compiles them. None of them run yet. Each compiled
module has a `realm` list of `RealmDeclaration`s
([compiler/compile.ts](../compiler/compile.ts)), one per marker:

| Marker | Declaration |
| --- | --- |
| `const X = well_known("%X%", create, …)` | `{ kind: "well_known", name, slot, object }`, where `object` is `"ordinary"`, `"function"`, `"array"` or `"string"` depending on `create` |
| `abstract_operation("Name", fn)` | `{ kind: "abstract_operation", name, slot }` |
| `internal_method(kind, "[[X]]", fn)` | `{ kind: "internal_method", object, method, slot }` |

`slot` is the position of the declared variable in the module's environment.

**2. Create the realm.** `create_realm` ([runtime/realm.ts](../runtime/realm.ts))
gathers the declarations from all the loaded modules and:

- **Checks them.** If a name is declared twice, or a name in `REQUIRED` is
  missing, it throws a `SyntaxError`. A broken stdlib fails here, before any
  of it runs.
- **Creates the well-known objects.** `allocate` creates each one, empty,
  using the same VM routine as its declaration's creation operation
  (`create_array` for `array_create`, and so on): no prototype, a length of 0
  for an array, the empty string for a `String` object. A built-in function
  is created with no code yet; its code is attached in step 3. The new object
  is stored in the module's `const` variable with `initialize_binding`, and
  handed to the VM with `set_realm_intrinsic`
  ([runtime/realm.ts](../runtime/realm.ts)). `%Object.prototype%` and
  `%Function.prototype%` come first, so every object and function created
  after them gets the right prototype.
- **Marks the functions the VM calls.** The functions named in
  `abstract_operation` and `internal_method` statements don't exist yet; they
  are created when their module runs. So `create_realm` marks their variables
  instead (`intrinsic_bindings` in [runtime/modules.ts](../runtime/modules.ts)).
  When `initialize_binding` ([vm/semantics/bindings.ts](../vm/semantics/bindings.ts)) later sets a
  marked variable, it hands the function to `set_realm_intrinsic`.

**3. Fill.** `define_globals(runtime, REALM)` runs the stdlib with
`evaluate_realm_module` ([runtime/modules.ts](../runtime/modules.ts)). Each
well-known literal fills in the object allocated for it (`fill_well_known` in
the compiler), and the marked functions reach the VM as they are defined.
Then the exports of `realm.js` become the globals.

This step is synchronous: each module runs to completion before the next, and
no jobs or host operations run in between. Unlike a program module, a stdlib
module gets no promise, since `%Promise%` itself is defined by the stdlib. A
stdlib module that suspends at a top-level `await` makes the VM panic.

**4. Node globals.** `define_globals(runtime, NODE_GLOBALS)` does the same for
[`stdlib/node/index.js`](../stdlib/node/index.js).

`set_realm_intrinsic` stores each value in `runtime.realm.intrinsics` under its
name. The prototypes that object creation needs are also kept in fields of
the `Realm` (`PROTOTYPE_FIELDS`).

## What the VM uses

This is the complete list of what the VM takes from the stdlib. Every name
here is in `REQUIRED`, so the stdlib can't load without declaring it. The VM
calls these functions synchronously (`invoke_sync` in
[vm/execution/calls.ts](../vm/execution/calls.ts)), so they must not use `await`.

### Well-known objects

| Object | Used for | Where |
| --- | --- | --- |
| [`%Object.prototype%`](https://tc39.es/ecma262/#sec-properties-of-the-object-prototype-object) | The prototype of object literals, class prototypes and other new objects | `realm.object_prototype`, read by `create_object` ([vm/semantics/objects.ts](../vm/semantics/objects.ts)) |
| [`%Function.prototype%`](https://tc39.es/ecma262/#sec-properties-of-the-function-prototype-object) | The prototype of every function, method and class | `realm.function_prototype`, read by `create_function` |
| [`%Array.prototype%`](https://tc39.es/ecma262/#sec-properties-of-the-array-prototype-object) | The prototype of array literals and rest parameters | `realm.array_prototype`, read by `create_array` |
| [`%String.prototype%`](https://tc39.es/ecma262/#sec-properties-of-the-string-prototype-object), [`%Symbol.prototype%`](https://tc39.es/ecma262/#sec-properties-of-the-symbol-prototype-object) | Property lookups on string and symbol primitives, such as `"abc".at(0)` | `prototype_reference` |
| [`%Error%`](https://tc39.es/ecma262/#sec-error-objects), [`%TypeError%`, `%RangeError%`, `%ReferenceError%`, `%SyntaxError%`](https://tc39.es/ecma262/#sec-native-error-types-used-in-this-standard) | Errors the VM throws, such as calling a non-function | `create_error` and `throw_error` ([vm/semantics/errors.ts](../vm/semantics/errors.ts)) |

To throw an error, the VM calls the constructor with the message, as in
`TypeError("Value is not callable")`, and throws the result. If that call
itself throws, the VM throws that exception instead. The errors the VM throws
are therefore the same kind of object as `new TypeError()` in a program.

### Abstract operations

| Operation | When the VM calls it | Called as | Where |
| --- | --- | --- | --- |
| [`ToPrimitive`](https://tc39.es/ecma262/#sec-toprimitive) | An operator such as `+` or `<` meets an object | `(value, hint)`; returns a primitive | `coerce_value` ([vm/execution/calls.ts](../vm/execution/calls.ts)) |
| [`ToString`](https://tc39.es/ecma262/#sec-tostring) | An object is used as a property key, including on the left of `in` | `(value)`; returns a string | `coerce_value` |
| [`ToNumber`](https://tc39.es/ecma262/#sec-tonumber) | Unary `+`, `-` or `~` meets an object | `(value)`; returns a number | `coerce_value` |
| [`NewPromiseCapability`](https://tc39.es/ecma262/#sec-newpromisecapability) | An async function is called, or a program module is evaluated | `()`; returns `{ promise, resolve, reject }` | `settle_with_promise` ([vm/execution/calls.ts](../vm/execution/calls.ts)) |
| [`Await`](https://tc39.es/ecma262/#await) | `await value` | `(value, on_fulfilled, on_rejected)`; arranges for exactly one callback to run | `await_value` ([vm/execution/calls.ts](../vm/execution/calls.ts)) |

### Internal methods

| Internal method | When | Called as | Where |
| --- | --- | --- | --- |
| [`[[Call]]`](https://tc39.es/ecma262/#sec-built-in-function-objects-call-thisargument-argumentslist) of a built-in function | It is called | `this` is the receiver; `new.target` is undefined | `call_function`, then `enter_builtin` |
| [`[[Construct]]`](https://tc39.es/ecma262/#sec-built-in-function-objects-construct-argumentslist-newtarget) of a built-in constructor | It is called with `new` | `this` is undefined; `new.target` is the constructor; returns the new object | `construct_function`, then `enter_builtin` |
| [`[[DefineOwnProperty]]`](https://tc39.es/ecma262/#sec-array-exotic-objects-defineownproperty-p-desc) of arrays | A property of an array is assigned or defined | `this` is the array; `(key, descriptor)`, with the key already converted to a string or symbol; returns a boolean | `exotic_define_own_property` and `invoke_define` ([vm/semantics/properties.ts](../vm/semantics/properties.ts)) |

When `[[DefineOwnProperty]]` returns false, the VM throws a `TypeError` if the
operation is supposed to fail loudly, such as an assignment in strict code.

## Errors during bootstrap

The VM can only throw a `TypeError` once `%TypeError%` is ready. Before
`create_realm` runs, `create_error` has no constructor to call. Between
allocation and filling, the constructor exists but has no code yet
(`enter_builtin` stops at it). In both cases the VM panics, stopping with the
error message. That only happens if the stdlib has a bug.

## Rules

- **Markers only.** The VM finds builtins through the markers. It never looks
  up a global or reads a property to find one.
- **Final shape.** Everything about a well-known object is in its declaration.
  Code doesn't change its prototype, attributes or internal methods later.
- **Synchronous.** Functions the VM calls must not use `await`, and stdlib
  modules must not use top-level `await`.

## Adding something the VM uses

1. Declare it in the stdlib with the right marker ([stdlib.md](stdlib.md)).
2. Add its name to `REQUIRED` in [runtime/realm.ts](../runtime/realm.ts), so
   the stdlib can't load without it.
3. Read it from `runtime.realm.intrinsics` by name. If object creation needs
   it, add a `Realm` field and an entry in `PROTOTYPE_FIELDS`.
4. Add it to the tables above.
