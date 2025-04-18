import type { Prettify } from './util.js'

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
      kind: 'strict_eq'
      name: Local
      left: Operand
      right: Operand
    }>
  | ro<{
      kind: 'or'
      name: Local
      left: Operand
      right: Operand
    }>
  | ro<{
      kind: 'add'
      name: Local
      left: Operand
      right: Operand
    }>
  | ro<{
      kind: 'sub'
      name: Local
      left: Operand
      right: Operand
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
  emit_strict_eq: (name: Local, left: Operand, right: Operand) =>
    ({
      kind: 'strict_eq',
      name,
      left,
      right,
    }) as const,
  emit_or: (name: Local, left: Operand, right: Operand) =>
    ({
      kind: 'or',
      name,
      left,
      right,
    }) as const,
  emit_add: (name: Local, left: Operand, right: Operand) =>
    ({
      kind: 'add',
      name,
      left,
      right,
    }) as const,
  emit_sub: (name: Local, left: Operand, right: Operand) =>
    ({
      kind: 'sub',
      name,
      left,
      right,
    }) as const,
} as const satisfies {
  [K in `emit_${Instr['kind']}`]: (...args: never[]) => Instr
}

export type Local = `%${string}`
export type Param = `$${string}`
export type Operand =
  | { kind: 'local'; name: Local }
  | { kind: 'param'; name: Param }
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
  param(name: Param): Operand {
    return {
      kind: 'param',
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

const ty = Object.freeze({
  ty_top: { kind: 'top' } as const,
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

export type Type = ro<{ kind: 'top' }>

export type FuncParam = { name: Param; type: Type }
export type Func = {
  name: string
  params: FuncParam[]
  blocks: [entry: BasicBlock, ...BasicBlock[]]
}

export function build_function(
  name: Global,
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
    add_param: (name: Param, type: Type) => {
      params.push({ name, type })
    },
    emit_get: e(i.emit_get),
    emit_set: e(i.emit_set),
    emit_make_object: e(i.emit_make_object),
    emit_call: e(i.emit_call),
    emit_return: e(i.emit_return),
    emit_jump_if: e(i.emit_jump_if),
    emit_strict_eq: e(i.emit_strict_eq),
    emit_or: e(i.emit_or),
    emit_add: e(i.emit_add),
    emit_sub: e(i.emit_sub),
    ...op,
    ...ty,
  }
  const params: FuncParam[] = []
  build(builder)
  return {
    name,
    params,
    blocks,
  }
}

type FunctionBuilder = Prettify<
  {
    add_block(name: BlockLabel, build_block: () => void): void
    add_param(name: Param, type: Type): void
  } & typeof op &
    typeof ty &
    InstrEmitters
>

type InstrEmitters = Prettify<{
  readonly [K in keyof typeof InstructionBuilders]: (
    ...args: Parameters<(typeof InstructionBuilders)[K]>
  ) => void
}>
