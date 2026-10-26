# Object model

How the VM represents JavaScript objects: what kind of object each one is,
how its internal methods are chosen, where its internal slots live, and how
built-in functions work.

## Values, addresses and handles

Every guest value is an eight-byte **value**: a number, or a tagged
`undefined`, `null`, boolean or reference to a heap object (`VALUE_TAGS` in
[vm/storage/value.ts](../vm/storage/value.ts)).

The heap ([vm/storage/heap.ts](../vm/storage/heap.ts)) is a copying garbage
collector, so a heap object moves whenever anything is allocated. VM code
therefore never keeps an **`Address`** (a byte offset into the heap) across an
allocation. It refers to values through **handles** instead: slots in the
`HandleTable` ([vm/storage/handles.ts](../vm/storage/handles.ts)) that the
collector updates when it moves objects. A handle has one of two lifetimes:

| Lifetime | Created with | Released | Used for |
| --- | --- | --- | --- |
| Local | `heap.handles.local()` | When the innermost `heap.handles.scope(() => …)` returns | Temporaries inside one VM function |
| Persistent | `heap.handles.persistent()` | By its owner, with `heap.handles.release` | Frame registers, fiber results, realm intrinsics, queued jobs |

A function that writes a result takes a `destination` handle from its caller,
so most VM code only creates locals. A scope can't span an `await` in host
code; such code uses a persistent handle.

## Heap types

Every heap object starts with a **heap type** (`HEAP_TYPES` in
[vm/storage/layout.ts](../vm/storage/layout.ts)). The type is set when the object is allocated
and never changes. These types are objects a program can see:

| Heap type | What it is | Created by ([vm/semantics/objects.ts](../vm/semantics/objects.ts)) |
| --- | --- | --- |
| `HEAP_TYPES.OBJECT` | An ordinary object | `create_object` |
| `HEAP_TYPES.FUNCTION` | A function, including built-in functions | `create_function` |
| `HEAP_TYPES.ARRAY` | An array | `create_array` |
| `HEAP_TYPES.STRING_OBJECT` | A `String` object, such as `new String("ab")` | `create_string_object` |
| `HEAP_TYPES.ERROR` | An ordinary object with the `[[ErrorData]]` slot | `ordinary_object_create(proto, ["[[ErrorData]]"])` |

The other types (`STRING`, `SYMBOL`, `PROPERTY`, `ENVIRONMENT`, …) are
primitives and the VM's own bookkeeping objects. Each has a module in
[vm/heap_types/](../vm/heap_types/) that creates and reads it.

## Internal methods and exotic objects

Every object has a fixed set of
[internal methods](https://tc39.es/ecma262/#sec-object-internal-methods-and-internal-slots),
such as `[[GetOwnProperty]]` and `[[DefineOwnProperty]]`. Most objects use the
default versions; the spec calls them **ordinary**. An **exotic** object
replaces some of the defaults. Arrays are the common case: assigning
`a[5] = 1` also updates `a.length`, because arrays have their own
`[[DefineOwnProperty]]`.

When the VM runs an internal method on an object, it checks the object's heap
type and uses that type's version. So an array keeps behaving like an array
even if its prototype is changed.

Each heap type's internal methods are defined once, for every object of that type:
either natively in the VM, or in the stdlib with a module-level
`internal_method(kind, "[[X]]", fn)` statement ([stdlib.md](stdlib.md#functions-the-vm-calls)).

### Creating exotic objects

At runtime, exotic objects are created by native operations named after the
spec's creation algorithms: `array_create`
([ArrayCreate](https://tc39.es/ecma262/#sec-arraycreate)) and `string_create`
([StringCreate](https://tc39.es/ecma262/#sec-stringcreate)). Array literals
and rest parameters create arrays directly.

A few builtins are themselves exotic. The spec says, for example,
"%Array.prototype% is an Array exotic object". A `well_known` declaration
names the operation that creates its object, so these are declared with the
same creation operation used at runtime:

```js
const ArrayPrototype = well_known("%Array.prototype%", array_create, {
  [slot("[[Prototype]]")]: ObjectPrototype,
  constructor: Array,
  …
})
```

Before any stdlib code runs, `create_realm` creates it the same way
`array_create` would (`allocate` in [runtime/realm.ts](../runtime/realm.ts)),
so `%Array.prototype%` is an array from the start and behaves like every other
array. Its contents are filled in when `array.js` runs.

### Arrays

Spec: [10.4.2 Array Exotic Objects](https://tc39.es/ecma262/#sec-array-exotic-objects).

| | |
| --- | --- |
| Heap type | `HEAP_TYPES.ARRAY` |
| Created by | Array literals, rest parameters, and `array_create`, including for well-known objects |
| Initial state | An own `length` property: `0` (or the given length), writable, non-enumerable, non-configurable |
| Internal methods that differ | `[[DefineOwnProperty]]` |
| Where they are implemented | In JavaScript: `array_define_own_property` in [stdlib/js/array.js](../stdlib/js/array.js), registered with `internal_method("array", "[[DefineOwnProperty]]", …)` |
| How the VM dispatches | Every property definition or assignment on a `HEAP_TYPES.ARRAY` object calls the registered function (`exotic_define_own_property` in [vm/semantics/properties.ts](../vm/semantics/properties.ts)) |
| Recognized by | `is_array` (the spec's [IsArray](https://tc39.es/ecma262/#sec-isarray)) |

`array_define_own_property` keeps `length` consistent with the elements:
defining an index at or past `length` grows it, and setting `length` smaller
deletes the elements past it (`array_set_length`, the spec's
[ArraySetLength](https://tc39.es/ecma262/#sec-arraysetlength)). It uses the
`ordinary_*` native operations to define properties without calling itself
again.

During bootstrap, `array_define_own_property` only takes effect once
`array.js` is evaluated. Until then, defining a property on an array does not
update its `length`.

### `String` objects

Spec: [10.4.3 String Exotic Objects](https://tc39.es/ecma262/#sec-string-exotic-objects).
These are `String` objects, such as `new String("ab")`, not string
primitives.

| | |
| --- | --- |
| Heap type | `HEAP_TYPES.STRING_OBJECT` |
| Created by | `string_create`, including for well-known objects, and `new String(…)` |
| Initial state | The `[[StringData]]` slot: the empty string, or the given string |
| Internal methods that differ | `[[GetOwnProperty]]`, `[[DefineOwnProperty]]` and `[[OwnPropertyKeys]]` |
| Where they are implemented | Natively in the VM. `virtual_property` ([vm/semantics/properties.ts](../vm/semantics/properties.ts)) reports an own `length` and one property per code unit (`"0"`, `"1"`, …), all non-writable and non-configurable. Definitions are validated against them like any non-configurable property, so they cannot be changed. `own_property_keys` lists them with the other own keys. |
| Recognized by | `has_slot(o, "[[StringData]]")`; `get_slot(o, "[[StringData]]")` reads the string |

`%String.prototype%` is declared with `string_create`, which creates it with
the empty string as its `[[StringData]]`. Its literal also lists
`[slot("[[StringData]]")]: ""` to match the spec text ("has a [[StringData]]
internal slot whose value is the empty String"); that member sets the same
value again.

### Adding an exotic heap type

The types above are built into the VM. A new one needs work in every layer:

1. **VM:** a heap type in `HEAP_TYPES` and its entry in `LAYOUTS`, which drives
   allocation and garbage collection tracing
   ([vm/storage/layout.ts](../vm/storage/layout.ts)), plus a module in
   [vm/heap_types/](../vm/heap_types/) that creates and reads it.
2. **Dispatch:** the internal methods that differ, either natively or by
   looking up a registered function the way `exotic_define_own_property` does.
3. **Compiler:** add its creation operation to `CREATION_OPERATIONS` and
   accept the kind in `declare_registration`
   ([compiler/compile.ts](../compiler/compile.ts)).
4. **Realm:** allocate it in `allocate` ([runtime/realm.ts](../runtime/realm.ts)).
5. **Native operations:** a creation operation that follows the spec's
   creation algorithm, and a way to recognize the type.
6. **Docs:** a section on this page.

## Internal slots

An object's slots are set when it is created, either by `[slot("[[Name]]")]`
members of a well-known object or by the list passed to
`ordinary_object_create`. Code reads and changes them with `has_slot`,
`get_slot` and `set_slot` ([native-operations.md](native-operations.md#internal-slots)).
All of this is implemented in [vm/semantics/internal_slots.ts](../vm/semantics/internal_slots.ts).

A few slots are part of how the VM represents objects, so the VM stores them
in its own way and `set_slot` refuses to change them:

| Slot | Stored as | `get_slot` returns | To change it |
| --- | --- | --- | --- |
| `[[Prototype]]` | The object's prototype pointer | The prototype or `null` | `ordinary_set_prototype_of`, which checks for cycles |
| `[[Extensible]]` | Not stored; all objects are currently extensible | `true` | Not supported yet |
| `[[StringData]]` | Inside the `String` object | The string | Can't be changed |
| `[[ErrorData]]` | The object's heap type, `HEAP_TYPES.ERROR` | `null` | Can't be changed |

Every other slot is stored like a private class field, with one hidden key
per slot name (`slot_key` in [vm/semantics/internal_slots.ts](../vm/semantics/internal_slots.ts)).
The compiler lists the slot names a module passes to `has_slot`, `get_slot`
and `set_slot` (`slot_names`), and linking creates their keys, so the realm's
persistent handles don't grow while code runs.

## Built-in functions

A [built-in function](https://tc39.es/ecma262/#sec-built-in-function-objects)
is a `HEAP_TYPES.FUNCTION` object whose code ID is `BUILTIN_CODE`
([vm/execution/native_operations.ts](../vm/execution/native_operations.ts)). Instead of bytecode of its own, it
holds a reference to another function, its **steps**: the function expression
written in its `well_known` declaration, or the `behaviour` passed to
`create_builtin_function`. `set_builtin_steps` and `load_builtin_steps` in
[vm/heap_types/function.ts](../vm/heap_types/function.ts) store and read it, along with a
`BUILTIN_CONSTRUCTOR` flag saying whether it can be used with `new`.

Calls go through `enter_builtin` ([vm/execution/calls.ts](../vm/execution/calls.ts)):

- **Called normally** (`call_function`), it runs the steps with `this` set to
  the receiver and `new.target` undefined.
- **Called with `new`** (`construct_function`), it runs the steps with `this`
  undefined and `new.target` set to the constructor. The VM doesn't create an
  object first; the steps create and return it.

The function's `name` and `length` are ordinary properties, defined when it
is created.
