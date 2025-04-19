import type { BasicBlock, BlockLabel } from './basic_block'
import { Instr } from './instructions'
import { Operand, type Param, type Global } from './operand'
import { Type } from './type'
import { objMapEntries, type Prettify } from './util'

export type FuncParam = { name: Param; type: Type }
export type Func = {
  name: Global
  params: FuncParam[]
  blocks: [entry: BasicBlock, ...BasicBlock[]]
}

export function build_function(
  name: Global,
  build: (builder: FunctionBuilder, emit: UnprefixedInstrEmitters) => void,
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
  const i = Instr
  const unprefixed_instr_emitters: UnprefixedInstrEmitters = {
    get: e(i.get),
    set: e(i.set),
    make_object: e(i.make_object),
    call: e(i.call),
    return: e(i.return),
    jump_if: e(i.jump_if),
    strict_eq: e(i.strict_eq),
    or: e(i.or),
    add: e(i.add),
    sub: e(i.sub),
  } as const
  const prefixed_instr_emitters: InstrEmitters = objMapEntries(
    unprefixed_instr_emitters,
    ([key, value]) => [`emit_${key}`, value],
  ) as never
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
    ...prefixed_instr_emitters,
    ...Type,
    ...Operand,
  }
  const params: FuncParam[] = []
  build(builder, unprefixed_instr_emitters)
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
  } & typeof Operand &
    typeof Type &
    InstrEmitters
>

/**
 * {
 *    make_object: (...args) => void
 *    set: (...args) => void
 *    ...
 * }
 */
type UnprefixedInstrEmitters = Prettify<{
  readonly [K in keyof typeof Instr]: (
    ...args: Parameters<(typeof Instr)[K]>
  ) => void
}>

/**
 * { emit_get, emit_set, ... }
 */
type InstrEmitters = Prettify<{
  readonly [K in keyof typeof Instr as `emit_${K}`]: (
    ...args: Parameters<(typeof Instr)[K]>
  ) => void
}>
