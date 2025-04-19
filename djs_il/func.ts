import type { BasicBlock, BlockLabel } from './basic_block'
import { Instr, is_ssa_instr, type SSAInstr } from './instructions'
import {
  Operand,
  type Param,
  type Global,
  type Local,
  type Constant,
} from './operand'
import { Type } from './type'
import { todo, type Prettify, assert } from './util'

export type FuncParam = { name: Param; type: Type }
export type Func = {
  name: Global
  params: FuncParam[]
  blocks: [entry: BasicBlock, ...BasicBlock[]]
}

export function build_function(
  name: Global,
  external_env: Record<Global, Type>,
  build: (ctx: FunctionBuilderCtx) => void,
): Func {
  let current_block: BasicBlock = {
    label: '.entry',
    instructions: [],
  }

  const blocks: [BasicBlock, ...BasicBlock[]] = [current_block]
  const params: FuncParam[] = []
  const locals = new Map<Local, Type>()
  assert(
    !(name in external_env),
    () => `Name ${name} is defined in use in the environment`,
  )
  const env: Record<Global, Type> = {
    ...external_env,
    get [name](): Type {
      return Type.unboxed_func(Type.value, ...params.map((param) => param.type))
    },
  }
  const infer_constant = (constant: Constant): Type => {
    switch (constant.kind) {
      case 'string':
        return Type.string
      case 'number':
        return Type.number
      case 'boolean':
        return Type.boolean
    }
  }
  const infer_operand = (operand: Operand): Type => {
    switch (operand.kind) {
      case 'local':
        return infer_local(operand.name)
      case 'param':
        return infer_param(operand.name)
      case 'global':
        return infer_global(operand.name)
      case 'constant':
        return infer_constant(operand.value)
    }
  }
  const infer_instr_result = (instr: SSAInstr): Type => {
    switch (instr.kind) {
      case 'get':
        return Type.value
      case 'call': {
        const callee_ty = infer_operand(instr.callee)
        assert(
          callee_ty.kind === 'unboxed_func',
          () => `Expected function type, got ${JSON.stringify(callee_ty)}`,
        )
        return callee_ty.returns
      }
      case 'make_object':
        return Type.object
      case 'strict_eq':
        return Type.boolean
      case 'or':
        return Type.boolean
      case 'add':
        return Type.number
      case 'sub':
        return Type.number
    }
  }
  const emit = (instruction: Instr) => {
    if (is_ssa_instr(instruction)) {
      const existing = locals.get(instruction.result)
      if (existing) {
        throw new Error(
          `Duplicate local ${instruction.result} found; Previously declared with type: ${JSON.stringify(existing, null, 2)}`,
        )
      }
      locals.set(instruction.result, infer_instr_result(instruction))
    }
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

  const i = Instr
  const emitters: InstructionEmitter = {
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

  const infer_local = (name: Local): Type => {
    const local = locals.get(name)
    if (!local) {
      throw new Error(`Local ${name} not found; locals: ${Array.from(locals)}`)
    }
    return local
  }
  const infer_param = (name: Param): Type => {
    const param = params.find((p) => p.name === name)
    assert(
      param,
      () => `Param ${name} not found; params: ${params.map((p) => p.name)}`,
    )
    return param.type
  }
  const infer_global = (name: Global): Type => {
    const ty = env[name]
    assert(ty, () => `Global ${name} not found; globals: ${Object.keys(env)}`)
    return ty
  }

  const OperandBuilder: OperandBuilder = {
    string: Operand.string,
    number: Operand.number,
    boolean: Operand.boolean,
    local: (name) => Operand.local(name, infer_local(name)),
    param: (name) => Operand.param(name, infer_param(name)),
    global: (name) => Operand.global(name, infer_global(name)),
  }

  const builder: FunctionBuilderCtx = {
    declare_global(name, type) {
      if (name in env) {
        throw new Error(`Global ${name} already declared`)
      }
      env[name] = type
    },
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
    emit: emitters,
    operand: OperandBuilder,
    type: Type,
  }
  build(builder)
  return {
    name,
    params,
    blocks,
  }
}
type OperandBuilder = {
  string: (value: string) => Operand
  number: (value: number) => Operand
  boolean: (value: boolean) => Operand
  local: (name: Local) => Operand
  param: (name: Param) => Operand
  global: (name: Global) => Operand
}

type TypeBuilder = typeof Type
interface FunctionBuilderCtx {
  add_block(name: BlockLabel, build_block: () => void): void
  add_param(name: Param, type: Type): void
  declare_global(name: Global, type: Type): void
  operand: OperandBuilder
  emit: InstructionEmitter
  type: TypeBuilder
}

/**
 * {
 *    make_object: (...args) => void
 *    set: (...args) => void
 *    ...
 * }
 */
type InstructionEmitter = Prettify<{
  readonly [K in keyof typeof Instr]: (
    ...args: Parameters<(typeof Instr)[K]>
  ) => void
}>
