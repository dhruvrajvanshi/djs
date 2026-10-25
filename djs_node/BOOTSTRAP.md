# Bootstrap

How the VM and the JS stdlib meet, and the rules that keep that boundary clean.
See [INTRINSICS.md](INTRINSICS.md) for the intrinsic APIs themselves.

## Layers

Each layer depends only on the layers below it.

1. **Builtins** — `stdlib/js/*.js`: `Object`, `Error`, `Array`… written from the spec text.
2. **Support** — [stdlib/js/support.js](stdlib/js/support.js): private helpers shared by builtins.
3. **Abstract ops** — `djs:abstract` ([stdlib/js/abstract.js](stdlib/js/abstract.js)): spec abstract operations.
4. **Native modules** — `djs:intrinsics` (VM primitives) and `djs:host` (embedder I/O): [vm/intrinsics.ts](vm/intrinsics.ts) `NATIVE_MODULES`.
5. **VM** — `vm/*.ts`: knows no builtin by name.

## Rules

- **`djs:abstract` holds only spec abstract operations, named after the spec**
  (`to_integer_or_infinity`, `create_data_property_or_throw`). Anything else
  goes in `support.js`.
- **No import cycles.** The module loader rejects them, so the import graph has
  to follow the layer order above.
- **Builtins are plain functions.** They use `new.target` instead of call and
  construct hooks, are marked with `builtin_function`, and install their
  methods with `define_methods`. There are no decorators.
- **The VM gets stdlib values only through the intrinsics manifest.**
  [stdlib/js/intrinsics.js](stdlib/js/intrinsics.js) re-exports them under the
  names in `REALM_INTRINSICS`. Nothing is registered imperatively.
- **Exported intrinsics are `const` or function bindings whose initial value is
  final.** The VM copies the value once, when the binding is initialized.
- **Stdlib code imports the values it needs** (`import { object_prototype }
  from "./object.js"`) rather than looking them up by name.
- **[stdlib/js/realm.js](stdlib/js/realm.js) defines the globals, and its import
  order is the initialization order.** `object.js` comes first.
- **Errors the VM throws are constructed by `%TypeError%` and the other error
  constructors.** An error before they are initialized is a VM panic, not a
  guest exception.

## Sequence

[runtime/bootstrap.ts](runtime/bootstrap.ts) `bootstrap`:

1. Load and link the manifest. `link_realm_intrinsics`
   ([runtime/modules.ts:342](runtime/modules.ts:342)) follows each export to its
   declaring binding and marks it; a missing export is a link error.
2. Evaluate `realm.js`. As each marked binding is initialized,
   `initialize_binding` ([vm/objects.ts:286](vm/objects.ts:286)) hands it to
   `set_realm_intrinsic` ([vm/intrinsics.ts:87](vm/intrinsics.ts:87)).
3. Install the `realm.js` exports as globals, then the `node:*` globals.

## Where the VM uses intrinsics

- **Prototypes:** `memory.object_prototype` and the other prototype fields, read
  by `create_object`, `create_array` and string boxing.
- **Errors:** `create_error` ([vm/completion.ts:31](vm/completion.ts:31)).
- **Coercions:** `coerce_value` calls `ToPrimitive`, `ToString` and `ToNumber`.
- **Array exotic behavior:** `exotic_define_own_property`
  ([vm/properties.ts:273](vm/properties.ts:273)).
- **Promises:** `AwaitPromise` and `NewPromiseCapability`, used by `await`
  and async functions.
- **Built-in construction:** the `BUILTIN_FUNCTION` path in `construct_function`
  ([vm/interpreter.ts:1603](vm/interpreter.ts:1603)).
