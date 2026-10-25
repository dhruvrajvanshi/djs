# Native operations

The stdlib needs a few things plain JavaScript can't do, such as creating an
array with a chosen prototype, defining a property on an array without
updating its `length`, or reading an internal slot. The VM provides these as
functions in two modules:

| Module | Contents |
| --- | --- |
| `djs:native` | Object and value operations, plus the declaration markers ([stdlib.md](stdlib.md)) |
| `djs:host` | File and console I/O, supplied by the program embedding djs_node |

Both are implemented in the `INTRINSICS` table in
[vm/intrinsics.ts](../vm/intrinsics.ts), and `NATIVE_MODULES` lists which
names each module exports. Calls run synchronously, through `call_intrinsic`.
Bad arguments throw a `TypeError` or `RangeError`.

When an operation does what a spec algorithm describes, it has that
algorithm's name in snake case: `ordinary_object_create` is
OrdinaryObjectCreate.

## Objects

| Operation | Spec | Returns |
| --- | --- | --- |
| `ordinary_object_create(proto, slots?)` | [OrdinaryObjectCreate](https://tc39.es/ecma262/#sec-ordinaryobjectcreate) | A new ordinary object with prototype `proto` (an object or `null`) and the internal slots named in the array `slots`, such as `["[[ErrorData]]"]` |
| `ordinary_get_prototype_of(o)` | [OrdinaryGetPrototypeOf](https://tc39.es/ecma262/#sec-ordinarygetprototypeof) | `o`'s prototype, or `null` |
| `ordinary_set_prototype_of(o, proto)` | [OrdinarySetPrototypeOf](https://tc39.es/ecma262/#sec-ordinarysetprototypeof) | `true`, or `false` if it would create a cycle |
| `get_own_property(o, key)` | [`[[GetOwnProperty]]`](https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-getownproperty-p) | A descriptor object (`value`, `writable`, `get`, `set`, `enumerable`, `configurable`), or `undefined` |
| `define_property_or_throw(o, key, desc)` | [DefinePropertyOrThrow](https://tc39.es/ecma262/#sec-definepropertyorthrow) | `undefined`; throws if the definition is refused. Goes through an exotic object's `[[DefineOwnProperty]]` |
| `has_property(o, key)` | [HasProperty](https://tc39.es/ecma262/#sec-hasproperty) | Whether `o` has `key`, own or inherited |
| `delete_property_or_throw(o, key)` | [DeletePropertyOrThrow](https://tc39.es/ecma262/#sec-deletepropertyorthrow) | `true`; throws if the property is non-configurable |
| `is_array(o)` | [IsArray](https://tc39.es/ecma262/#sec-isarray) | Whether `o` is an Array exotic object |
| `is_constructor(f)` | [IsConstructor](https://tc39.es/ecma262/#sec-isconstructor) | Whether `new f()` is allowed |

`define_property_or_throw` takes a plain descriptor object, such as
`{ value: 1, writable: true }`. Its fields must be ordinary data properties,
not getters.

### Skipping exotic behavior

| Operation | Spec | Returns |
| --- | --- | --- |
| `ordinary_define_own_property(o, key, desc)` | [OrdinaryDefineOwnProperty](https://tc39.es/ecma262/#sec-ordinarydefineownproperty) | `true`, or `false` if the definition is refused |
| `ordinary_delete(o, key)` | [OrdinaryDelete](https://tc39.es/ecma262/#sec-ordinarydelete) | `true`, or `false` if the property is non-configurable |
| `ordinary_own_property_keys(o)` | [OrdinaryOwnPropertyKeys](https://tc39.es/ecma262/#sec-ordinaryownpropertykeys) | An array of `o`'s own keys, in spec order |

These always use the default behavior, even on exotic objects. They're meant
for implementing an exotic object's own internal methods:
`array_define_own_property` uses them to store a property without calling
itself again. Elsewhere, avoid them on exotic objects; for example,
`ordinary_define_own_property` on an array can leave its `length` wrong.

## Internal slots

| Operation | Returns |
| --- | --- |
| `has_slot(o, "[[Name]]")` | Whether `o` has the slot |
| `get_slot(o, "[[Name]]")` | The slot's value; throws if `o` does not have it |
| `set_slot(o, "[[Name]]", value)` | `undefined`; throws if `o` does not have it |

These are implemented in [vm/slots.ts](../vm/slots.ts). Rules:

- **Write the slot name as a string literal.** The compiler requires it, and
  doesn't let you pass these three functions around as values
  (`SLOT_OPERATIONS` in [compiler/compile.ts](../compiler/compile.ts)). That
  way every slot name appears in the source.
- **An object's slots are set when it is created.** They come from
  `[slot("[[Name]]")]` members of a well-known object, or from the list passed
  to `ordinary_object_create`. `set_slot` can change a slot's value but can't
  add a new slot.
- **The VM manages a few slots itself.** `set_slot` refuses to change
  `[[Prototype]]` (use `ordinary_set_prototype_of`), `[[Extensible]]`,
  `[[StringData]]` and `[[ErrorData]]`.
  [object-model.md](object-model.md#internal-slots) explains how each slot is
  stored.

## Values

| Operation | Spec | Returns |
| --- | --- | --- |
| `array_create(length, proto?)` | [ArrayCreate](https://tc39.es/ecma262/#sec-arraycreate) | A new array of `length`, inheriting from `proto` or `%Array.prototype%` |
| `string_create(value, proto?)` | [StringCreate](https://tc39.es/ecma262/#sec-stringcreate) | A new String object for the string `value`, inheriting from `proto` or `%String.prototype%` |
| `create_builtin_function(behaviour, length, name)` | [CreateBuiltinFunction](https://tc39.es/ecma262/#sec-createbuiltinfunction) | A new built-in function that runs `behaviour` when called. It can't be used with `new` |
| `symbol_create(description)` | — | A new symbol; `description` is a string or `undefined` |
| `symbol_description(symbol)` | — | The symbol's description, or `undefined` |
| `well_known_symbol(name)` | [Well-known symbols](https://tc39.es/ecma262/#sec-well-known-symbols) | The VM's symbol for `name`, such as `"iterator"` |
| `string_code_unit_at(s, index)` | — | The UTF-16 code unit at `index` |
| `string_slice(s, start, end)` | — | The code units from `start` to `end` |
| `string_from_code_unit(unit)` | — | A one-code-unit string |
| `byte_buffer(length)` | — | A byte buffer for I/O |

## Calls and jobs

| Operation | Spec | Effect |
| --- | --- | --- |
| `call(f, thisValue, ...args)` | [Call](https://tc39.es/ecma262/#sec-call) | Calls `f` with `thisValue` as `this`. A program can overwrite `f.call`, but not this |
| `host_enqueue_promise_job(job)` | [HostEnqueuePromiseJob](https://tc39.es/ecma262/#sec-hostenqueuepromisejob) | Adds `job` to the queue that runs after the current code finishes, as promise callbacks do ([runtime/jobs.ts](../runtime/jobs.ts)) |

## `djs:host`

| Operation | Effect |
| --- | --- |
| `write_stdout(text)` | Writes `text` to standard output |
| `process_cwd()` | Returns the current working directory |
| `io_open(path, flags, mode, resolve, reject)`, `io_read(…)`, `io_close(…)` | Asynchronous file I/O. The result is passed to `resolve` or `reject` later. Used by [stdlib/node/fs/promises.js](../stdlib/node/fs/promises.js) |

The VM forwards these to the host object passed to `create_runtime`. By
default that's [host/node.ts](../host/node.ts), which uses Node's APIs.
