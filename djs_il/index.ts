type ro<T> = Readonly<T>
type Instr =
  | ro<{ kind: 'make_object'; name: Local }>
  | ro<{
      kind: 'set'
      object: Op
      property: Op
      value: Op
    }>
  | ro<{
      kind: 'get'
      name: Local
      object: Op
      property: Op
    }>
  | ro<{
      kind: 'call'
      name: Local
      callee: Op
      args: Op[]
    }>
  | ro<{ kind: 'return'; value: Op }>

const InstructionBuilders = Object.freeze({
  emit_set: (object: Op, property: Op, value: Op) =>
    ({
      kind: 'set',
      object,
      property,
      value,
    }) as const,
  emit_get: (name: Local, object: Op, property: Op) =>
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
  emit_call: (name: Local, callee: Op, args: Op[]) =>
    ({
      kind: 'call',
      name,
      callee,
      args,
    }) as const,
  emit_return: (value: Op) =>
    ({
      kind: 'return',
      value,
    }) as const,
})

type Local = `%${string}`
type Param = `$${string}`
type Op =
  | { kind: 'local'; name: Local }
  | { kind: 'constant'; value: Constant }
  | { kind: 'global'; name: Global }

const op = Object.freeze({
  local(name: Local): Op {
    return {
      kind: 'local',
      name,
    }
  },
  global(name: Global): Op {
    return {
      kind: 'global',
      name,
    }
  },
  string(value: string): Op {
    return {
      kind: 'constant',
      value: {
        kind: 'string',
        value,
      },
    }
  },
  number(value: number): Op {
    return {
      kind: 'constant',
      value: {
        kind: 'number',
        value,
      },
    }
  },
  boolean(value: boolean): Op {
    return {
      kind: 'constant',
      value: {
        kind: 'boolean',
        value,
      },
    }
  },
})

type Constant =
  | {
      kind: 'string'
      value: string
    }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }

type BlockLabel = `.${string}`
type Global = `@${string}`
type BasicBlock = {
  label: BlockLabel
  instructions: Instr[]
}

type Type = { kind: 'top' }

type Func = {
  name: string
  params: { name: Param; type: Type }[]
  blocks: [entry: BasicBlock, ...BasicBlock[]]
}

export function buildFunction(
  name: Global,
  params: { name: Param; type: Type }[],
  build: (builder: FunctionBuilder) => void,
): Func {
  let currentBlock: BasicBlock = {
    label: '.entry',
    instructions: [],
  }
  const emit = (instruction: Instr) => {
    currentBlock.instructions.push(instruction)
    return instruction
  }
  const e = <Args extends unknown[], I extends Instr>(
    f: (...args: Args) => I,
  ) => {
    return (...args: Args) => {
      emit(f(...args))
    }
  }
  const i = InstructionBuilders
  const builder: FunctionBuilder = {
    add_block(name) {
      const block: BasicBlock = {
        label: name,
        instructions: [],
      }
      currentBlock = block
    },
    emit,
    emit_get: e(i.emit_get),
    emit_set: e(i.emit_set),
    emit_make_object: e(i.emit_make_object),
    emit_call: e(i.emit_call),
    emit_return: e(i.emit_return),
    ...op,
  }
  build(builder)
  const blocks: [BasicBlock, ...BasicBlock[]] = [currentBlock]
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
      add_block(name: BlockLabel): void
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

export function prettyPrint(f: Func) {
  const header = `function ${f.name}`
  const params = f.params.map(ppParam).join(', ')
  const blocks = f.blocks.map(ppBlock).join('\n')
  return `${header}(${params}) {\n${blocks}\n}`

  function ppParam(param: { name: Param; type: Type }) {
    return `${param.name}: ${ppType(param.type)}`
  }
  function ppType(type: Type): string {
    switch (type.kind) {
      case 'top':
        return 'top'
    }
  }
  function ppBlock(block: BasicBlock) {
    const instructions = block.instructions
      .map(ppInstruction)
      .map((it) => `  ${it}`)
      .join('\n')
    return `${block.label}:\n${instructions}`
  }

  function ppInstruction(instruction: Instr) {
    switch (instruction.kind) {
      case 'make_object':
        return `${instruction.name} = make_object`
      case 'set':
        return `set ${ppOperand(instruction.object)}[${ppOperand(instruction.property)}] = ${ppOperand(instruction.value)}`
      case 'get':
        return `${instruction.name} = get ${ppOperand(instruction.object)}[${ppOperand(instruction.property)}]`
      case 'call':
        return `${instruction.name} = call ${ppOperand(instruction.callee)}(${instruction.args
          .map(ppOperand)
          .join(', ')})`
      case 'return':
        return `return ${ppOperand(instruction.value)}`
      default:
        assertNever(instruction)
    }
  }

  function ppOperand(operand: Op) {
    switch (operand.kind) {
      case 'local':
        return operand.name
      case 'constant':
        return ppConstant(operand.value)
      case 'global':
        return operand.name
      default:
        assertNever(operand)
    }
  }
  function ppConstant(constant: Constant) {
    switch (constant.kind) {
      case 'string':
        return JSON.stringify(constant.value)
      case 'number':
        return `${constant.value}`
      case 'boolean':
        return `${constant.value}`
      default:
        assertNever(constant)
    }
  }
}
function assertNever(x: never): never {
  throw new Error(`Unexpected object: ${x}`)
}
