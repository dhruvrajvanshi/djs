import type { Brand } from "../utils.ts"

// Operands have instruction-dependent meanings. Brand them in the opcode that
// establishes their meaning.
export type BytecodeOffset = Brand<number, "BytecodeOffset">

export function bytecode_offset(operand: number): BytecodeOffset {
  return operand as BytecodeOffset
}

export function optional_bytecode_offset(
  operand: number,
): BytecodeOffset | null {
  return operand === 0xffffffff ? null : bytecode_offset(operand)
}

export type RegisterIndex = Brand<number, "RegisterIndex">

export function register_index(operand: number): RegisterIndex {
  return operand as RegisterIndex
}

// Six little-endian u32 words per instruction. Branch targets are byte offsets.
export const INSTRUCTION_BYTES = 24

export const BUILTIN_PROTOTYPE = Object.freeze({
  object: 0,
  array: 1,
  string: 2,
})

export type BuiltinPrototype =
  (typeof BUILTIN_PROTOTYPE)[keyof typeof BUILTIN_PROTOTYPE]

export const OP = Object.freeze({
  LOAD_CONST: 1,
  MOVE: 2,
  LOAD_BINDING: 3,
  INIT_BINDING: 4,
  STORE_BINDING: 5,
  LOAD_GLOBAL: 6,
  GET_PROP: 7,
  SET_PROP: 8,
  CREATE_OBJECT: 9,
  CREATE_CLOSURE: 10,
  CALL: 11,
  RETURN: 12,
  AWAIT: 13,
  THROW: 14,
  JUMP: 15,
  JUMP_IF_FALSY: 16,
  BINARY_OP: 17,
  UNARY_OP: 18,
  LOAD_THIS: 19,
  CONSTRUCT: 20,
  DEFINE_PROP: 21,
  SET_PROTO: 22,
  INIT_PRIVATE: 23,
  GET_PRIVATE: 24,
  SET_PRIVATE: 25,
  HAS_PRIVATE: 26,
  TRY: 27,
  LEAVE_TRY: 28,
  END_FINALLY: 29,
  CREATE_ARRAY: 30,
  DELETE_PROP: 31,
  LOAD_NEW_TARGET: 32,
  INIT_BUILTIN_CLASS: 33,
  INSTALL_INTERNAL_METHOD: 34,
  REGISTER_BUILTIN: 35,
  TO_PROPERTY_KEY: 36,
  PUSH_ENV: 37,
  POP_ENV: 38,
  COPY_ENV: 39,
  JUMP_OUT: 40,
  GET_ITERATOR: 41,
  ITERATOR_NEXT: 42,
  ITERATOR_CLOSE: 43,
  FOR_IN_START: 44,
  FOR_IN_NEXT: 45,
})

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
  opcode: (typeof OP)[keyof typeof OP]
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
    opcode: view.getUint32(0, true) as (typeof OP)[keyof typeof OP],
    a: view.getUint32(4, true),
    b: view.getUint32(8, true),
    c: view.getUint32(12, true),
    d: view.getUint32(16, true),
    e: view.getUint32(20, true),
  }
}
