// Six little-endian u32 words per instruction. Branch targets are byte offsets.
export const INSTRUCTION_BYTES = 24

export const OP = Object.freeze(
  Object.fromEntries(
    [
      "CONST",
      "MOVE",
      "LOAD_ENV",
      "INIT_ENV",
      "STORE_ENV",
      "LOAD_GLOBAL",
      "GET_PROP",
      "SET_PROP",
      "OBJECT",
      "CLOSURE",
      "CALL",
      "RETURN",
      "AWAIT",
      "THROW",
      "JUMP",
      "JUMP_IF_FALSE",
      "BINARY",
      "UNARY",
      "LOAD_THIS",
      "CONSTRUCT",
      "DEFINE_PROP",
      "SET_PROTO",
      "PRIVATE_INIT",
      "PRIVATE_GET",
      "PRIVATE_SET",
      "PRIVATE_HAS",
      "TRY",
      "LEAVE_TRY",
      "END_FINALLY",
      "ARRAY",
      "DELETE_PROP",
      "LOAD_NEW_TARGET",
    ].map((name, index) => [name, index + 1]),
  ),
)

export function encode_instructions(instructions) {
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

export function decode_instruction(bytes, pc) {
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
  return Object.fromEntries(
    ["opcode", "a", "b", "c", "d", "e"].map((name, index) => [
      name,
      view.getUint32(index * 4, true),
    ]),
  )
}
