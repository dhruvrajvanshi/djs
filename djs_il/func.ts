import type { BasicBlock, BlockLabel } from './basic_block'
import { Instr } from './instructions'
import { Operand, type Param, type Global } from './operand'
import { Type } from './type'
import type { Prettify } from './util'

export type FuncParam = { name: Param; type: Type }
export type Func = {
  name: Global
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
  const i = Instr
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
    ...Type,
    ...Operand,
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
  } & typeof Operand &
    typeof Type &
    InstrEmitters
>

type InstrEmitters = Prettify<{
  readonly [K in keyof typeof Instr]: (
    ...args: Parameters<(typeof Instr)[K]>
  ) => void
}>
