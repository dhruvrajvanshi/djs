import type { Brand } from "../utils.ts"

// Operands have instruction-dependent meanings. Brand them in the opcode that
// establishes their meaning.
export type BytecodeOffset = Brand<number, "BytecodeOffset">

export function bytecode_offset(operand: number): BytecodeOffset {
  return operand as BytecodeOffset
}

export type RegisterIndex = Brand<number, "RegisterIndex">

export function register_index(operand: number): RegisterIndex {
  return operand as RegisterIndex
}

// An opcode and five operands, as little-endian u32 words.
export const INSTRUCTION_BYTES = 24

/**
 * Docs list each opcode's operands in order. Operands are registers unless
 * marked: `#` is an index into a constant or compile-time table, `@` a jump
 * target (byte offset), `=` an immediate value.
 */
export const OP = Object.freeze({
  /** `dst, #value` */
  LOAD_CONST: 1,
  /** `dst, src` */
  MOVE: 2,
  /** `dst` */
  LOAD_THIS: 3,
  /** `dst` */
  LOAD_NEW_TARGET: 4,
  /**
   * `dst, #name, =allow_missing`: A missing global throws, unless `allow_missing`
   * (for `typeof x`).
   */
  LOAD_GLOBAL: 5,

  /**
   * `dst, =depth, =slot`: reads a variable stored in an environment rather
   * than a register, because closures or the module keep it alive past the
   * frame. `depth` counts environments outward.
   */
  LOAD_BINDING: 6,
  /** `=depth, =slot, src`: initializes a binding, ending its TDZ. */
  INIT_BINDING: 7,
  /** `=depth, =slot, src`: assigns a binding. Throws on `const` and imports. */
  STORE_BINDING: 8,
  /** `#block`: enters a block that declares captured variables. */
  PUSH_ENV: 9,
  /** `=count`: leaves `count` environments. */
  POP_ENV: 10,
  /**
   * `#block`: gives each `for (let ...)` iteration a fresh copy of the
   * environment, so closures don't share loop variables.
   */
  COPY_ENV: 11,

  /**
   * `dst, #template, first`: an object literal. Values and computed keys are
   * in consecutive registers from `first`.
   */
  CREATE_OBJECT: 12,
  /**
   * `dst, first, =length, #holes`: an array literal. `holes` lists elided
   * positions, or is NO_HOLES.
   */
  CREATE_ARRAY: 13,
  /** `dst, #function` */
  CREATE_CLOSURE: 14,
  /**
   * `dst, #class, first`: a class's constructor, prototype and methods.
   * Computed keys are from `first`. Fields are added by later instructions.
   */
  CREATE_CLASS: 15,
  /**
   * `function, key, #prefix`: sets a method's `name` when its key is
   * computed.
   */
  SET_FUNCTION_NAME: 16,
  /** `dst, object, key` */
  GET_PROP: 17,
  /** `object, key, src` */
  SET_PROP: 18,
  /**
   * `object, key, src, =flags, =setter`: defines a property without calling
   * setters, as literals and class fields do. For accessors, `src` is the
   * getter, or the setter if `setter`.
   */
  DEFINE_PROP: 19,
  /** `dst, object, key` */
  DELETE_PROP: 20,
  /** `object, proto` */
  SET_PROTO: 21,
  /**
   * `dst, src`: converts a computed key at the point the language specifies,
   * since the conversion can run user code.
   */
  TO_PROPERTY_KEY: 22,
  /**
   * `object, key, src, =readonly`: adds a private field, or a method if
   * `readonly`. `key` is the private name's per-class token.
   */
  INIT_PRIVATE: 23,
  /** `dst, object, key` */
  GET_PRIVATE: 24,
  /** `object, key, src` */
  SET_PRIVATE: 25,
  /** `dst, object, key`: `#x in object`. */
  HAS_PRIVATE: 26,
  /** `object, #name, src`: stdlib only. See docs/stdlib.md. */
  INIT_SLOT: 27,
  /** `object, steps, =constructor`: stdlib only. See docs/stdlib.md. */
  SET_BEHAVIOR: 28,

  /** `dst, callee, receiver, first, =count` */
  CALL: 29,
  /** `dst, callee, _, first, =count`: same layout as CALL. */
  CONSTRUCT: 30,
  /**
   * `dst, callee, receiver, first, =count`: like CALL, followed by the
   * values of the iterable in register `first + count` (`f(a, ...b)`).
   */
  CALL_SPREAD: 74,
  /** `dst, callee, _, first, =count`: same layout as CALL_SPREAD. */
  CONSTRUCT_SPREAD: 75,
  /** `src` */
  RETURN: 31,
  /** `dst, src` */
  AWAIT: 32,
  /**
   * `src`: throws. Any throw goes to the function's handler table. Try
   * statements compile to entries in that table, not to instructions.
   */
  THROW: 33,
  /** `#type, #message`: throws an error the compiler can predict. */
  THROW_ERROR: 34,

  /** `@target` */
  JUMP: 35,
  /** `cond, @target` */
  JUMP_IF_FALSY: 36,
  /** `cond, @target` */
  JUMP_IF_TRUTHY: 37,
  /** `src, @target` */
  JUMP_IF_NOT_NULLISH: 38,
  /** `src, @target` */
  JUMP_IF_NOT_UNDEFINED: 39,
  /**
   * `link, @target`: calls a finally block. Every exit from the try saves a
   * return point in `link` and jumps here. The block ends with
   * JUMP_INDIRECT.
   */
  JUMP_AND_LINK: 40,
  /** `link`: jumps to the address saved in `link`. */
  JUMP_INDIRECT: 41,

  /** `iterator, next, src`: starts iterating `src` (for-of). */
  GET_ITERATOR: 42,
  /** `iterator, next, src`: iterates the keys for-in visits. */
  GET_FOR_IN_ITERATOR: 43,
  /** `dst, iterator, next, @done`: jumps to `done` when exhausted. */
  ITERATOR_NEXT: 44,
  /**
   * `iterator, =throwing`: closes an iterator on early loop exit. If
   * `throwing`, errors from `return` are dropped.
   */
  ITERATOR_CLOSE: 45,

  // `dst, left, right`
  ADD: 46,
  SUB: 47,
  MUL: 48,
  DIV: 49,
  MOD: 50,
  EXP: 51,
  BIT_AND: 52,
  BIT_OR: 53,
  BIT_XOR: 54,
  SHL: 55,
  SHR: 56,
  USHR: 57,
  EQ: 58,
  NOT_EQ: 59,
  STRICT_EQ: 60,
  STRICT_NOT_EQ: 61,
  LT: 62,
  LT_EQ: 63,
  GT: 64,
  GT_EQ: 65,
  IN: 66,
  INSTANCEOF: 67,

  // `dst, src`
  NOT: 68,
  NEGATE: 69,
  /** Unary `+`. */
  TO_NUMBER: 70,
  BIT_NOT: 71,
  TYPEOF: 72,
  /**
   * Template literal substitutions. Unlike ADD, prefers an object's
   * `toString` to its `valueOf`.
   */
  TO_STRING: 73,
})

export type Opcode = (typeof OP)[keyof typeof OP]

export const NO_HOLES = 0xffffffff

/** ExceptionHandler.environment for the function's own environment. */
export const FUNCTION_ENVIRONMENT = 0xffffffff

/**
 * Declaration markers, recognized at compile time through imports of
 * djs:native.
 */
export const NATIVE_MARKERS: readonly string[] = Object.freeze([
  "well_known",
  "slot",
  "internal_method",
  "attributes",
  "abstract_operation",
])

export type Instruction = number[]

export function encode_instructions(instructions: Instruction[]) {
  const bytes = new Uint8Array(instructions.length * INSTRUCTION_BYTES)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < instructions.length; i++) {
    if (instructions[i].length > 6)
      throw new Error("Too many instruction operands")
    for (let word = 0; word < 6; word++) {
      const value = instructions[i][word] ?? 0
      if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
        throw new RangeError(
          "Bytecode operands must be unsigned 32-bit integers",
        )
      }
      view.setUint32(i * INSTRUCTION_BYTES + word * 4, value, true)
    }
  }
  return bytes
}

export interface DecodedInstruction {
  opcode: Opcode
  a: number
  b: number
  c: number
  d: number
  e: number
}

export function decode_instruction(
  bytes: Uint8Array,
  pc: number,
): DecodedInstruction {
  if (
    pc % INSTRUCTION_BYTES !== 0 ||
    pc < 0 ||
    pc + INSTRUCTION_BYTES > bytes.length
  ) {
    throw new RangeError("Invalid bytecode instruction position")
  }
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset + pc,
    INSTRUCTION_BYTES,
  )
  return {
    opcode: view.getUint32(0, true) as Opcode,
    a: view.getUint32(4, true),
    b: view.getUint32(8, true),
    c: view.getUint32(12, true),
    d: view.getUint32(16, true),
    e: view.getUint32(20, true),
  }
}
