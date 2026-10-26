# djs_node

djs_node runs JavaScript. It compiles each module to bytecode and interprets
the bytecode. Most of the standard library (`Object`, `Array`, `Error`, …) is
written in JavaScript, in [`stdlib/js/`](../stdlib/js/), using a small set of
operations the VM provides.

## Reading order

| Page | Read it when |
| --- | --- |
| This page | You are new and want the layout, how a program runs, and the vocabulary |
| [interpreter.md](interpreter.md) | You want to know how bytecode runs: registers, environments, calls, exceptions and `await` |
| [stdlib.md](stdlib.md) | You are changing or adding a builtin, such as `Array.prototype.map` |
| [realm.md](realm.md) | You want to know how the stdlib is loaded, or you are changing something the VM relies on |
| [object-model.md](object-model.md) | You want to know how the VM represents objects: arrays and `String` objects, internal slots, built-in functions |
| [native-operations.md](native-operations.md) | You are using a `djs:native` or `djs:host` function |

## Where things are

| Directory | Contents | Start with |
| --- | --- | --- |
| [`compiler/`](../compiler/) | Parses source (through `djs_parser`) and emits bytecode | `compile_module` in [compile.ts](../compiler/compile.ts) |
| [`vm/`](../vm/) | `storage/`: the heap and boxed values. `records/`: one module per heap kind. `semantics/`: JavaScript operations on them. `execution/`: the interpreter, calls and native operations | `run_interpreter` in [interpreter.ts](../vm/execution/interpreter.ts) |
| [`runtime/`](../runtime/) | The `Runtime`, the realm, module loading and linking, the job queue, bootstrap | `bootstrap` in [bootstrap.ts](../runtime/bootstrap.ts) |
| [`stdlib/js/`](../stdlib/js/) | The ECMAScript builtins | [realm.js](../stdlib/js/realm.js), which lists the globals |
| [`stdlib/node/`](../stdlib/node/) | The `node:*` modules | [index.js](../stdlib/node/index.js) |
| [`host/`](../host/) | File system and stdout access, provided by Node | [node.ts](../host/node.ts) |
| [`tests/`](../tests/), [`e2e/`](../e2e/) | Tests. Each `tests/<name>.js` is a program whose expected stdout, stderr and exit status are in `<name>.stdout`, `<name>.stderr` and `<name>.status` (each optional; missing means empty, or 0 for status) | [fixtures.test.js](../e2e/fixtures.test.js) |

## How a program runs

1. [`djs_node.ts`](../djs_node.ts) creates a `Runtime` and calls `bootstrap`
   ([runtime/bootstrap.ts](../runtime/bootstrap.ts)).
2. `bootstrap` loads the stdlib and creates the **realm**: the builtin objects
   every program shares, such as `%Array.prototype%` (the spec's name for
   `Array.prototype`; see [Vocabulary](#vocabulary)). [realm.md](realm.md)
   walks through this.
3. `run_module` ([runtime/modules.ts](../runtime/modules.ts)) loads the
   program. `load_module` reads each file, compiles it with `compile_module`,
   and loads its imports; `evaluate_module` runs the bytecode.
4. `run_interpreter` ([vm/execution/interpreter.ts](../vm/execution/interpreter.ts)) executes one
   instruction at a time. Some instructions need a builtin: throwing a
   `TypeError`, giving an array literal its prototype, or converting an object
   with `ToPrimitive`. The interpreter gets those from the realm.
   [interpreter.md](interpreter.md) explains this step.

## Vocabulary

The stdlib follows the [ECMAScript specification](https://tc39.es/ecma262/)
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

## Layers

| Layer | Where | Contents |
| --- | --- | --- |
| Builtins | `stdlib/js/*.js` | One declaration per well-known intrinsic |
| Support | [`stdlib/js/support.js`](../stdlib/js/support.js) | Helpers shared by builtins that are not spec operations |
| Abstract operations | `djs:abstract` ([`stdlib/js/abstract.js`](../stdlib/js/abstract.js)) | Spec abstract operations, named after the spec |
| Native modules | `djs:native`, `djs:host` | Operations JavaScript cannot express, in [`vm/execution/native_operations.ts`](../vm/execution/native_operations.ts) |
| VM | `vm/` | Runs bytecode; reaches builtins through the realm |

Each layer imports only from the layers below it. The module loader rejects
import cycles.
