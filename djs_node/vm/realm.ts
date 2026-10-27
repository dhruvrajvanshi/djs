/**
 * Realm is the set of builtin global objects that all Javascript core depends on.
 * This is stuff like Object.prototype, Array.prototype, etc, Object, Array, objects
 * themselves and so on.
 *
 * Most of these are implemented in the stdlib itself, with `djs:vm` providing the necessary
 * machinery to register them.
 */
import type { Runtime } from "../runtime/runtime.ts"
import type { Heap, Persistent } from "./storage/heap.ts"
import { write_number, write_undefined } from "./storage/value.ts"
import { write_string } from "./heap_types/string.ts"
import { create_symbol } from "./heap_types/symbol.ts"
import { allocate_object, set_prototype } from "./heap_types/object.ts"
import {
  create_array,
  create_function,
  create_string_object,
} from "./semantics/objects.ts"
import { define_property } from "./semantics/properties.ts"
import { panic } from "../utils.ts"
import {
  NATIVE_CODE,
  native_operation_id,
} from "./execution/native_operations.ts"

export const WELL_KNOWN_SYMBOLS = Object.freeze([
  "asyncIterator",
  "hasInstance",
  "isConcatSpreadable",
  "iterator",
  "match",
  "matchAll",
  "replace",
  "search",
  "species",
  "split",
  "toPrimitive",
  "toStringTag",
  "unscopables",
])

/**
 * The objects the VM creates before any guest code runs, because values it
 * produces inherit from them.
 */
export const INTRINSIC_OBJECTS = Object.freeze({
  object_prototype: "%Object.prototype%",
  function_prototype: "%Function.prototype%",
  array_prototype: "%Array.prototype%",
  string_prototype: "%String.prototype%",
  symbol_prototype: "%Symbol.prototype%",
  error_prototype: "%Error.prototype%",
  type_error_prototype: "%TypeError.prototype%",
  range_error_prototype: "%RangeError.prototype%",
  reference_error_prototype: "%ReferenceError.prototype%",
  syntax_error_prototype: "%SyntaxError.prototype%",
})
export type IntrinsicObject = keyof typeof INTRINSIC_OBJECTS

const ERROR_PROTOTYPES: Readonly<Record<string, IntrinsicObject>> = {
  Error: "error_prototype",
  TypeError: "type_error_prototype",
  RangeError: "range_error_prototype",
  ReferenceError: "reference_error_prototype",
  SyntaxError: "syntax_error_prototype",
}

export const ABSTRACT_OPERATIONS = Object.freeze([
  "ToPrimitive",
  "CopyDataProperties",
  "EnumerateObjectProperties",
  "RegExpCreate",
  "NewPromiseCapability",
  "Await",
] as const)
export type AbstractOperation = (typeof ABSTRACT_OPERATIONS)[number]

export const INTERNAL_METHODS = Object.freeze([
  "array [[DefineOwnProperty]]",
] as const)
export type InternalMethod = (typeof INTERNAL_METHODS)[number]

export class Realm {
  intrinsics: Partial<Record<IntrinsicObject, Persistent>> = {}
  abstract_operations = new Map<AbstractOperation, Persistent>()
  internal_methods = new Map<InternalMethod, Persistent>()
  /** Set once the stdlib has built the realm; the slots above can't change after. */
  frozen = false
  slot_keys = new Map<string, Persistent>()
  well_known_symbols = new Map<string, Persistent>()
  globals = new Map<string, Persistent>()

  constructor(heap: Heap) {
    for (const [name, value] of [
      ["undefined", undefined],
      ["NaN", NaN],
      ["Infinity", Infinity],
    ] as [string, number | undefined][]) {
      const global = heap.handles.persistent()
      if (value === undefined) write_undefined(heap, global)
      else write_number(heap, global, value)
      this.globals.set(name, global)
    }
  }

  get object_prototype() {
    return this.intrinsics.object_prototype
  }
  get function_prototype() {
    return this.intrinsics.function_prototype
  }
  get array_prototype() {
    return this.intrinsics.array_prototype
  }
  get string_prototype() {
    return this.intrinsics.string_prototype
  }
  get symbol_prototype() {
    return this.intrinsics.symbol_prototype
  }

  error_prototype(name: string) {
    const intrinsic = ERROR_PROTOTYPES[name]
    return intrinsic && this.intrinsics[intrinsic]
  }

  /**
   * Certain core operations which the VM calls into are implemented in the stdlib.
   * This method retrieves such operations by name.
   *
   * They're defined by the stdlib by calling `set_abstract_operation` from `djs:vm` module.
   */
  abstract_operation(name: AbstractOperation) {
    const operation = this.abstract_operations.get(name)
    if (operation === undefined) panic(`${name} is not registered yet`)
    return operation
  }

  /**
   * See {@link abstract_operation}. Very similar concept but for methods.
   */
  internal_method(name: InternalMethod) {
    const method = this.internal_methods.get(name)
    if (method === undefined) panic(`${name} is not registered yet`)
    return method
  }
}

export function create_intrinsics(runtime: Runtime) {
  const { heap, realm } = runtime
  heap.handles.scope(() => {
    const value = heap.handles.local()
    for (const name of WELL_KNOWN_SYMBOLS) {
      const symbol = heap.handles.persistent()
      write_string(heap, value, `Symbol.${name}`)
      create_symbol(heap, symbol, value)
      realm.well_known_symbols.set(name, symbol)
    }
    const intrinsic = (name: IntrinsicObject) =>
      (realm.intrinsics[name] = heap.handles.persistent())

    allocate_object(heap, intrinsic("object_prototype"), undefined)
    // A built-in function that accepts any arguments and returns undefined.
    const function_prototype = intrinsic("function_prototype")
    create_function(
      runtime,
      function_prototype,
      NATIVE_CODE,
      native_operation_id("function_prototype"),
    )
    set_prototype(heap, function_prototype, realm.object_prototype!)
    write_number(heap, value, 0)
    define_property(runtime, function_prototype, "length", {
      value,
      configurable: true,
    })
    write_string(heap, value, "")
    define_property(runtime, function_prototype, "name", {
      value,
      configurable: true,
    })
    const object_prototype = realm.object_prototype!
    create_array(runtime, intrinsic("array_prototype"), 0, object_prototype)
    create_string_object(
      runtime,
      intrinsic("string_prototype"),
      value,
      object_prototype,
    )
    for (const name of [
      "symbol_prototype",
      "error_prototype",
      "type_error_prototype",
      "range_error_prototype",
      "reference_error_prototype",
      "syntax_error_prototype",
    ] as const)
      allocate_object(heap, intrinsic(name), realm.object_prototype)
  })
}

export function freeze_realm(runtime: Runtime) {
  const { realm } = runtime
  for (const name of ABSTRACT_OPERATIONS)
    if (!realm.abstract_operations.has(name))
      throw new SyntaxError(`The stdlib does not register ${name}`)
  for (const name of INTERNAL_METHODS)
    if (!realm.internal_methods.has(name as InternalMethod))
      throw new SyntaxError(`The stdlib does not register ${name}`)
  realm.frozen = true
}
