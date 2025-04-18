type ro<T> = Readonly<T>
export type Instr =
  | ro<{ kind: 'make_object'; name: Local }>
  | ro<{
      kind: 'set'
      object: Operand
      property: Operand
      value: Operand
    }>
  | ro<{
      kind: 'get'
      name: Local
      object: Operand
      property: Operand
    }>
  | ro<{
      kind: 'call'
      name: Local
      callee: Operand
      args: Operand[]
    }>
  | ro<{ kind: 'return'; value: Operand }>
  | TerminatorInstr

export type TerminatorInstr = ro<{
  kind: 'jump_if'
  condition: Operand
  if_truthy: BlockLabel
  if_falsy: BlockLabel
}>
const InstructionBuilders = {
  emit_set: (object: Operand, property: Operand, value: Operand) =>
    ({
      kind: 'set',
      object,
      property,
      value,
    }) as const,
  emit_get: (name: Local, object: Operand, property: Operand) =>
    ({
      kind: 'get',
      name,
      object,
      property,
    }) as const,
  emit_make_object: (name: Local) =>
    ({
      kind: 'make_object',
      name,
    }) as const,
  emit_call: (name: Local, callee: Operand, args: Operand[]) =>
    ({
      kind: 'call',
      name,
      callee,
      args,
    }) as const,
  emit_return: (value: Operand) =>
    ({
      kind: 'return',
      value,
    }) as const,
  emit_jump_if: (
    condition: Operand,
    if_truthy: BlockLabel,
    if_falsy: BlockLabel,
  ) => ({
    kind: 'jump_if',
    condition,
    if_truthy,
    if_falsy,
  }),
} as const satisfies {
  [K in `emit_${Instr['kind']}`]: (...args: never[]) => Instr
}

export type Local = `%${string}`
export type Param = `$${string}`
export type Operand =
  | { kind: 'local'; name: Local }
  | { kind: 'constant'; value: Constant }
  | { kind: 'global'; name: Global }

const op = Object.freeze({
  local(name: Local): Operand {
    return {
      kind: 'local',
      name,
    }
  },
  global(name: Global): Operand {
    return {
      kind: 'global',
      name,
    }
  },
  string(value: string): Operand {
    return {
      kind: 'constant',
      value: {
        kind: 'string',
        value,
      },
    }
  },
  number(value: number): Operand {
    return {
      kind: 'constant',
      value: {
        kind: 'number',
        value,
      },
    }
  },
  boolean(value: boolean): Operand {
    return {
      kind: 'constant',
      value: {
        kind: 'boolean',
        value,
      },
    }
  },
})

export type Constant =
  | {
      kind: 'string'
      value: string
    }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }

export type BlockLabel = `.${string}`
export type Global = `@${string}`
export type BasicBlock = {
  label: BlockLabel
  instructions: Instr[]
}

export type Type = { kind: 'top' }

export type Func = {
  name: string
  params: { name: Param; type: Type }[]
  blocks: [entry: BasicBlock, ...BasicBlock[]]
}

export function build_function(
  name: Global,
  params: { name: Param; type: Type }[],
  build: (builder: FunctionBuilder) => void,
): Func {
  let current_block: BasicBlock = {
    label: '.entry',
    instructions: [],
  }
  const emit = (instruction: Instr) => {
    current_block.instructions.push(instruction)
    return instruction
  }
  const e = <Args extends unknown[], I extends Instr>(
    f: (...args: Args) => I,
  ) => {
    return (...args: Args) => {
      emit(f(...args))
    }
  }

  const blocks: [BasicBlock, ...BasicBlock[]] = [current_block]
  const i = InstructionBuilders
  const builder: FunctionBuilder = {
    add_block(name, build) {
      const block: BasicBlock = {
        label: name,
        instructions: [],
      }
      blocks.push(block)
      const last_block = current_block
      current_block = block
      build()
      if (current_block !== block) {
        throw new Error(
          `Current block changed from ${last_block.label} to ${current_block.label}`,
        )
      }
      current_block = last_block
    },
    emit,
    emit_get: e(i.emit_get),
    emit_set: e(i.emit_set),
    emit_make_object: e(i.emit_make_object),
    emit_call: e(i.emit_call),
    emit_return: e(i.emit_return),
    emit_jump_if: e(i.emit_jump_if),
    ...op,
  }
  build(builder)
  return {
    name,
    params,
    blocks,
  }
}

type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

type FunctionBuilder = Prettify<
  typeof op &
    InstructionEmitters & {
      add_block(name: BlockLabel, build_block: () => void): void
      emit(instruction: Instr): void
    }
>

type AsVoidResult<T> = T extends (...args: infer Args) => unknown
  ? (...args: Args) => void
  : never

type InstructionEmitters = {
  [K in keyof typeof InstructionBuilders]: AsVoidResult<
    (typeof InstructionBuilders)[K]
  >
}
