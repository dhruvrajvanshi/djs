import type { Handle } from "./storage/heap.ts"
import { write_number } from "./storage/value.ts"
import type { FunctionDescriptor } from "../compiler/compile.ts"
import type { Runtime } from "../runtime/runtime.ts"
import { write_string } from "./heap_types/string.ts"
import { allocate_object } from "./heap_types/object.ts"
import { allocate_function } from "./heap_types/function.ts"
import { allocate_array } from "./heap_types/array.ts"
import { allocate_string_object } from "./heap_types/string_object.ts"
import { define_property } from "./properties.ts"

// Objects created here inherit from the realm's prototypes, which are absent
// (null) only while the realm itself is being created.

export function create_object(runtime: Runtime, destination: Handle) {
  allocate_object(runtime.heap, destination, runtime.realm.object_prototype)
}

export function create_function(
  runtime: Runtime,
  destination: Handle,
  code_id: number,
  function_id: number,
  environment?: Handle,
  flags: number = 0,
  receiver?: Handle,
  new_target?: Handle,
  metadata?: Pick<FunctionDescriptor, "name" | "length">,
) {
  const { heap } = runtime
  allocate_function(
    heap,
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
    heap.handles.scope(() => {
      const value = heap.handles.local()
      write_number(heap, value, metadata.length)
      define_property(runtime, destination, "length", {
        value,
        configurable: true,
      })
      write_string(heap, value, metadata.name)
      define_property(runtime, destination, "name", {
        value,
        configurable: true,
      })
    })
  }
}

/** An omitted prototype selects %Array.prototype%. */
export function create_array(
  runtime: Runtime,
  destination: Handle,
  length: number,
  prototype: Handle | undefined = runtime.realm.array_prototype,
) {
  allocate_array(runtime.heap, destination, length, prototype)
}

/** An omitted prototype selects %String.prototype%. */
export function create_string_object(
  runtime: Runtime,
  destination: Handle,
  value: Handle,
  prototype: Handle | undefined = runtime.realm.string_prototype,
) {
  allocate_string_object(runtime.heap, destination, value, prototype)
}

export function create_arguments_object(
  runtime: Runtime,
  destination: Handle,
  arguments_: Handle[],
) {
  const { heap } = runtime
  create_object(runtime, destination)
  heap.handles.scope(() => {
    const length = heap.handles.local()
    write_number(heap, length, arguments_.length)
    define_property(runtime, destination, "length", {
      value: length,
      writable: true,
      configurable: true,
    })
    for (let index = 0; index < arguments_.length; index++)
      define_property(runtime, destination, String(index), {
        value: arguments_[index],
        writable: true,
        enumerable: true,
        configurable: true,
      })
  })
}
