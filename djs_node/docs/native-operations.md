# Native operations

The stdlib needs a few things plain JavaScript can't do, such as creating an
array with a chosen prototype, defining a property on an array without
updating its `length`, or reading an internal slot. The VM provides these as
functions in two modules, defined in
[vm/execution/native_operations.ts](../vm/execution/native_operations.ts):

| Module | Contents |
| --- | --- |
| `djs:native` | Object and value operations, plus the declaration markers ([stdlib.md](stdlib.md)) |
| `djs:host` | File and console I/O, forwarded to the host passed to `new Runtime` ([host/node.ts](../host/node.ts) by default) |

## Implementing exotic objects

An exotic object's internal methods are written in JS, and they need to
reach the default behavior without calling themselves again. The array's
`[[DefineOwnProperty]]` updates `length`, then stores the property with
`ordinary_define_own_property`. `ordinary_delete` and
`ordinary_own_property_keys` serve the same purpose.

## Internal slots

`has_slot`, `get_slot` and `set_slot` read and write an object's internal
slots. An object gets its slots when it's created, from `[slot("[[Name]]")]`
members of a well-known object or the list passed to `ordinary_object_create`.
Slot names are always string literals: the compiler collects them so linking
can create each slot's key ahead of time
([object-model.md](object-model.md#internal-slots)).
