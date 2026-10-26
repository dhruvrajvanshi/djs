import type { Root } from "../storage/value.ts"
import { write_number } from "../storage/value.ts"
import type { FunctionDescriptor } from "../../compiler/compile.ts"
import type { Runtime } from "../../runtime/runtime.ts"
import { write_string } from "../records/string.ts"
import { allocate_object } from "../records/object.ts"
import { allocate_function } from "../records/function.ts"
import { allocate_array } from "../records/array.ts"
import { allocate_string_object } from "../records/string_object.ts"
import { define_property } from "./properties.ts"

// Objects created here inherit from the realm's prototypes, which are absent
// (null) only while the realm itself is being created.

export function create_object(runtime: Runtime, destination: Root) {
  allocate_object(runtime.memory, destination, runtime.realm.object_prototype)
}

export function create_function(
  runtime: Runtime,
  destination: Root,
  code_id: number,
  function_id: number,
  environment?: Root,
  flags: number = 0,
  receiver?: Root,
  new_target?: Root,
  metadata?: Pick<FunctionDescriptor, "name" | "length">,
) {
  const { memory } = runtime
  allocate_function(
    memory,
    destination,
    runtime.realm.function_prototype,
    code_id,
    function_id,
    environment,
    flags,
    receiver,
    new_target,
  )
  if (metadata) {
    const key = memory.alloc_root(),
      value = memory.alloc_root()
    try {
      write_string(memory, key, "length")
      write_number(memory, value, metadata.length)
      define_property(runtime, destination, key, value, 4)
      write_string(memory, key, "name")
      write_string(memory, value, metadata.name)
      define_property(runtime, destination, key, value, 4)
    } finally {
      memory.free_root(key)
      memory.free_root(value)
    }
  }
}

/** An omitted prototype selects %Array.prototype%. */
export function create_array(
  runtime: Runtime,
  destination: Root,
  length: number,
  prototype: Root | undefined = runtime.realm.array_prototype,
) {
  allocate_array(runtime.memory, destination, length, prototype)
}

/** An omitted prototype selects %String.prototype%. */
export function create_string_object(
  runtime: Runtime,
  destination: Root,
  value: Root,
  prototype: Root | undefined = runtime.realm.string_prototype,
) {
  allocate_string_object(runtime.memory, destination, value, prototype)
}

export function create_arguments_object(
  runtime: Runtime,
  destination: Root,
  arguments_: Root[],
) {
  const { memory } = runtime
  create_object(runtime, destination)
  const key = memory.alloc_root(),
    length = memory.alloc_root()
  try {
    write_string(memory, key, "length")
    write_number(memory, length, arguments_.length)
    define_property(runtime, destination, key, length, 5)
    for (let index = 0; index < arguments_.length; index++) {
      write_string(memory, key, String(index))
      define_property(runtime, destination, key, arguments_[index])
    }
  } finally {
    memory.free_root(key)
    memory.free_root(length)
  }
}
