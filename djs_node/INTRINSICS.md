# Runtime, intrinsics and builtins

The stdlib is ordinary DJS code layered on a small native core. Each layer
only depends on the layers below it:

| Layer        | Where                         | Contents                                                         |
| ------------ | ----------------------------- | ---------------------------------------------------------------- |
| Builtins     | `stdlib/js/*.js`              | `Object`, `Error`, `Array`… written from the spec text           |
| Abstract ops | `djs:abstract`                | Spec abstract operations such as `to_string`, `make_constructor` |
| Support      | `stdlib/js/support.js`        | Private helpers shared by builtins, such as `define_methods`     |
| Intrinsics   | `djs:intrinsics`, `djs:host`  | Native operations JS cannot express                              |
| VM           | `vm/*.ts`                     | Values, heap, objects and bytecode; knows no builtin names       |

`djs:intrinsics` exposes object and value primitives (`object_create`,
`set_prototype`, `define_property`, `array_create`, `string_box`…).
`djs:host` exposes I/O provided by the embedder (`write_stdout`,
`process_cwd`, `io_open`, `io_read`, `io_close`).

## Realm intrinsics

The VM needs some stdlib values: prototypes for literals and boxed values,
error constructors for the errors it throws, coercions, and promise hooks.
`stdlib/js/intrinsics.js` re-exports them under the names listed in
`REALM_INTRINSICS` in `vm/intrinsics.ts`, for example:

```js
export { object_prototype as "%Object.prototype%" } from "./object.js"
```

Before the stdlib is evaluated, bootstrap links this manifest and marks the
binding behind each export; a missing export is a link error. When a marked
binding is initialized, the VM receives its value. Exported intrinsics must
therefore be `const` or function bindings whose initial value is final.

`stdlib/js/realm.js` exports the globals. Its import order is the realm's
initialization order: `object.js` comes first, because objects created before
`%Object.prototype%` exists have a null prototype.

The VM throws errors by calling `%TypeError%`, `%RangeError%` and so on, so
guest and VM errors are the same kind of object. An error raised before the
error constructors are initialized is a VM panic.

## Built-in functions

```js
import { builtin_function, object_create } from "djs:intrinsics"
import { make_constructor, get_prototype_from_constructor } from "djs:abstract"
import { object_prototype } from "./object.js"

const record_prototype = object_create(object_prototype)

function Record(value) {
  if (new.target === undefined) return value
  const record = object_create(
    get_prototype_from_constructor(new.target, record_prototype),
  )
  record.value = value
  return record
}
builtin_function(Record, 1)
make_constructor(Record, record_prototype)
```

`builtin_function(fn, length)` marks an ordinary function as a built-in
function (spec 10.3). Calling it behaves as usual. Constructing it does not
allocate a receiver: `this` is undefined, `new.target` is set, and the function
returns the object it creates. The optional `length` replaces the parameter
count.

`make_constructor` installs a read-only `prototype` and a non-enumerable
`prototype.constructor`. `define_methods(object, { ... })` from `support.js`
copies the methods and accessors of an object literal as non-enumerable
properties, which is how builtins install their methods.

## Exotic objects

Array exotic behavior is implemented in JS. The VM dispatches guest
assignments and property definitions on arrays to the registered
`ArrayDefineOwnProperty(array, key, descriptor)`. Returning false produces a
TypeError at these throwing entry points; thrown guest values propagate
unchanged.

`ordinary_define_own_property` bypasses this dispatch and returns false when
ordinary descriptor validation refuses a definition. `ordinary_delete` similarly
returns a boolean. `ordinary_own_property_keys` snapshots ordinary own keys in
property order. These are low-level stdlib operations: using them directly can
bypass the invariants enforced by an exotic object.

`error_create(prototype)` allocates an object carrying the `[[ErrorData]]`
brand, which the host uses to print uncaught errors.
