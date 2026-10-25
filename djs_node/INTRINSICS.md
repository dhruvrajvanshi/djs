# Intrinsic class annotations

DJS recognizes `@builtin` and `@internalMethod` during compilation. These
annotations do not evaluate decorator expressions or call runtime decorator
functions. Options and hook names must be literals.

```js
import {
  builtin_object_create,
  ordinary_define_own_property,
} from "djs:intrinsics"

@builtin({ name: "Record", length: 1 })
class Record {
  @internalMethod("Call")
  static #call(receiver, args) {
    return args[0]
  }

  @internalMethod("Construct")
  static #construct(args, newTarget) {
    return builtin_object_create(newTarget, newTarget.prototype)
  }

  @internalMethod("DefineOwnProperty")
  #define(key, descriptor) {
    return ordinary_define_own_property(this, key, descriptor)
  }
}
```

`@builtin` accepts `name` (defaults to the class name), `length` (defaults to the
constructor's parameter count), and `prototype` (`"object"` by default or
`"array"`). The Array builtin uses an array prototype and registers the canonical
layout used by array literals and `array_create`.

Supported internal methods:

| Annotation            | Placement               | Parameters                | Result          |
| --------------------- | ----------------------- | ------------------------- | --------------- |
| `"Call"`              | Static private method   | Receiver, argument list   | Any guest value |
| `"Construct"`         | Static private method   | Argument list, new target | Object          |
| `"DefineOwnProperty"` | Instance private method | Property key, descriptor  | Boolean         |

Argument lists are internal array-like objects with indexed values and `length`.
Hooks must be synchronous, non-generator methods with two parameters. Each hook
can be declared once. A class without a Call hook retains the ordinary class
restriction against calls without `new`. Without a Construct hook, construction
allocates an instance carrying the class's layout and executes its constructor.
An explicit Construct hook controls allocation and initialization itself.

Hook references live in GC-traced layout records. Instances retain their layout
independently of their prototype chain. Annotated instance hooks are VM entry points, rather than ordinary private fields.
Hook methods are not public properties; changing the prototype or installing a similarly named property does not replace
them. Inheriting a builtin's prototype alone does not give an object its layout.

The VM dispatches guest assignments and property definitions through
DefineOwnProperty. Returning false produces a TypeError at these throwing entry
points; thrown guest values propagate unchanged. Public array methods remain
generic and can operate on ordinary array-like objects.

`ordinary_define_own_property` bypasses the internal hook and returns false when
ordinary descriptor validation refuses a definition. `ordinary_delete` similarly
returns a boolean. `ordinary_own_property_keys` snapshots ordinary own keys in
property order. These are low-level stdlib operations: using them directly can
bypass the invariants enforced by an exotic object's hook.

The Array class implements indexed-property growth and length truncation in JS.
Its allocator still provides array branding, raw storage, and the initial length
property. Truncation scans existing own keys so sparse arrays do not require a
loop over every hole.

Instance field layouts and `@internalSlot` are not implemented yet. Ordinary
static fields are supported. Additional internal methods, general-purpose JS
decorators, and class inheritance are outside the current annotation surface.
