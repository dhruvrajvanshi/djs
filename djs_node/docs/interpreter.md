# The interpreter

This page explains how djs_node runs bytecode. It covers the shape of an
instruction, where values live while a function runs, and how calls,
exceptions and `await` move control from one place to another. The opcodes
themselves are documented in the `OP` table in
[compiler/bytecode.ts](../compiler/bytecode.ts).

## Reading bytecode

`--dump-ir` prints a module's bytecode without running it:

```bash
node djs_node.ts --dump-ir file.js
```

For this function:

```js
function add_one(a) {
  const x = a + 1
  return x
}
```

it prints:

```
Function 1 "add_one" (params=1, slots=7, bindings=0):
  0: MOVE dst=2 src=0
  24: LOAD_CONST dst=3 literal=0
  48: ADD dst=4 left=2 right=3
  72: MOVE dst=1 src=4
  96: MOVE dst=5 src=1
  120: RETURN src=5
  144: LOAD_CONST dst=6 literal=1
  168: RETURN src=6
```

Each line starts with the instruction's byte offset. `slots` is the number of
registers, and `bindings` is the size of the function's environment (see
[Registers and environments](#registers-and-environments)). The last two
instructions are the `return undefined` that the compiler appends to every
function.

## Instructions

Every instruction is 24 bytes long: an opcode followed by five unsigned 32-bit
operands, with unused operands set to 0. The program counter (`pc`) and jump
targets are byte offsets.

What an operand means depends on the opcode. It is one of these:

- a register,
- an index into one of the module's tables (literals, object templates,
  classes, functions),
- a jump target,
- an immediate value.

The doc comment on each opcode says which.

`compile_module` produces a `CompiledModule`, which holds one
`FunctionDescriptor` per function. The module's top-level code is a function
too: `<module>`, the module's `entry`. Each descriptor carries its own
bytecode, its register count, how its parameters are bound, and its
exception-handler table.

## Registers and environments

While a function runs, a local value lives in one of two places.

**Registers** are a fixed-size array of persistent handles in the call's
frame ([object-model.md](object-model.md#values-addresses-and-handles)). They
are allocated when the function is called and released when it returns. Temporaries live here,
and so does every variable that no nested function uses. In the example above,
`a` is register 0 and `x` is register 1.

**Environments** are heap objects that hold **bindings** (variables) in
numbered slots, and each one links to a parent environment. A variable that a
nested function uses is *captured*: it has to outlive the frame, so it lives
in an environment. Module-level variables always live in the module's
environment, because imports, exports and the [realm](realm.md) find them by
slot.

```js
function counter() {
  let n = 0
  const step = 1
  return () => {
    n = n + step
    return n
  }
}
```

```
Function 2 "" (params=0, slots=5, bindings=0):
  0: LOAD_BINDING dst=0 depth=1 binding=0
  24: LOAD_BINDING dst=1 depth=1 binding=1
  48: ADD dst=2 left=0 right=1
  72: STORE_BINDING depth=1 binding=0 src=2
  ...
```

The arrow function reads `n` and `step` from its parent's environment
(`depth=1`), in slots 0 and 1. It copies them into registers, works on the
registers, and stores the result back.

The compiler resolves every variable to a register, or to a depth and a slot,
ahead of time. Globals, such as `console`, are looked up by name:
`LOAD_GLOBAL` finds them in the realm.

When a function is called, it gets one new environment, whose parent is the
environment its closure captured at `CREATE_CLOSURE`. Most block scopes share
this environment and simply use different slots. A block inside a loop is the
exception: if it declares captured variables, it gets its own environment. It
enters that environment with `PUSH_ENV` and leaves it with `POP_ENV`, so each
iteration's closures see separate bindings. A `for (let …)` loop also runs
`COPY_ENV` between iterations, because the language requires each iteration to
start with a copy of the previous iteration's values.

A binding in an environment starts out uninitialized. Reading it before
`INIT_BINDING` runs throws a `ReferenceError`; this is the temporal dead zone
(TDZ). A register variable has no run-time check. The compiler knows which
reads can only happen before the declaration, and compiles them to
`THROW_ERROR`.

## Fibers and frames

The VM's call stack is made of two types, both in
[vm/execution/fiber.ts](../vm/execution/fiber.ts):

- A **`Frame`** is one active call of a bytecode function. It holds the
  function, the `pc`, the registers, the current environment, `this`,
  `new.target`, and the caller's register that receives the return value.
  Each frame links to its caller's frame.
- A **`Fiber`** is a stack of frames that can run, suspend and finish on its
  own. It has a status (`READY`, `RUNNING`, `WAITING`, `DONE`, `FAILED`) and a
  slot for its result or error.

`run_interpreter` ([vm/execution/interpreter.ts](../vm/execution/interpreter.ts))
executes the top frame of one fiber. It decodes the instruction at `pc`,
advances `pc`, and dispatches on the opcode.

`CALL` to a bytecode function pushes a frame onto the current fiber and
returns. The loop then continues with the callee's first instruction. `RETURN` pops the frame and
writes the value into the caller's destination register. When the last frame
returns, the fiber is `DONE`.

`call_function` ([vm/execution/calls.ts](../vm/execution/calls.ts)) decides
what a call does, based on the callee:

| Callee | What happens |
| --- | --- |
| Bytecode function | Pushes a frame |
| Built-in function | Pushes a frame for its steps, the JavaScript function that implements it ([object-model.md](object-model.md#built-in-functions)) |
| `djs:native` operation | Runs TypeScript directly through `call_native_operation` |
| Async function | Runs in a new fiber (see [`await`](#await)) |

New fibers are created in these cases:

| When | Why |
| --- | --- |
| A module is evaluated | Each module body runs in its own fiber |
| An async function is called | So that `AWAIT` suspends only that call |
| VM code needs a JavaScript result right away (`invoke_sync`) | Examples: `ToPrimitive` calling `valueOf`, `ITERATOR_NEXT` calling `next`, any abstract operation the VM gets from the realm. The fiber runs to completion before the instruction continues, and must not await |
| A job runs | Each promise reaction is a fresh call |

## Exceptions

VM operations that guest code can see fail return a `Status`, either `OK` or
`THROW` ([vm/semantics/errors.ts](../vm/semantics/errors.ts)). On `THROW`, the
thrown value waits in `runtime.pending_exception`. The interpreter then
**unwinds**:

1. It looks up the throwing instruction in the current function's handler
   table. Each entry covers a range of instructions and names a target, a
   register to receive the exception, and the environment to restore.
2. If an entry matches, the interpreter restores that environment, stores the
   exception, and jumps to the target.
3. If no entry matches, it pops the frame and repeats from step 1 in the
   caller. If no frames are left, the fiber is `FAILED`, with the exception
   as its error.

`try` compiles to an entry in the handler table. In `--dump-ir` output, an entry looks like
this:

```
  handler 48..168 -> 192 exception=6
```

The handler stores which environment to restore because blocks may have
pushed environments between the start of the `try` and the throw.

Code can leave a `try` with a `finally` in several ways: by reaching the end,
or by `return`, `break` or `continue`. Each exit uses `JUMP_AND_LINK` to save
where it was going in a register and jump into the block, and the block ends
with `JUMP_INDIRECT` back to that address.

## `await`

An async function runs in its own fiber, which `AWAIT` suspends:

1. `AWAIT` sets the fiber to `WAITING` and stops running it. The frame's
   `pc` already points past the `AWAIT`.
2. It creates two **resume functions**: internal function objects that each
   remember the fiber, the `AWAIT`'s destination register, and whether they
   report fulfillment or rejection. It passes them, along with the awaited
   value, to the stdlib's `Await` abstract operation, which subscribes them to
   the promise.
3. When the promise settles, a job calls one of the two functions. The
   function writes the value into the destination register, or into the
   fiber's error if the promise rejected, and sets the fiber to `READY`.
4. After every job, the scheduler runs each `READY` fiber. If the promise
   rejected, the fiber throws as if from the `AWAIT` instruction, so a
   surrounding `try` catches it.

An async function call and a program module's evaluation each get a promise,
created by `settle_with_promise` ([vm/execution/calls.ts](../vm/execution/calls.ts))
with the stdlib's `NewPromiseCapability`. When the fiber finishes,
`run_task` settles that promise with the result or the error.

## The event loop

`evaluate_module` ([runtime/modules.ts](../runtime/modules.ts)) runs a program
module's fiber, then `run_event_loop` repeats these steps:

1. Turn finished host operations, such as file reads, into jobs
   (`drain_completions` in [runtime/scheduler.ts](../runtime/scheduler.ts)).
   Running a job also runs every fiber it made `READY`.
2. Run every queued job (`drain_jobs`).
3. If the module's promise rejected, stop and report the error.
4. If no jobs are queued but host operations are still pending, wait for the
   next one to finish. This is where the VM yields to Node's event loop.
5. Once nothing is queued or pending, stop if the promise is fulfilled.

The host reads the promise's state from its `[[PromiseState]]` slot. If
nothing is queued or pending and the promise is still pending, the module's
top-level `await` can never settle. djs_node then exits with code 13, as Node
does.

The stdlib is not evaluated this way: it runs synchronously while the realm
is set up ([realm.md](realm.md#step-by-step)).
