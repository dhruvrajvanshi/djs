type ro<T> = Readonly<T>
export type DILInstruction =
  | ro<{ kind: 'make_object'; name: DILLocalRef }>
  | ro<{
      kind: 'set'
      object: DILOperand
      property: DILOperand
      value: DILOperand
    }>
  | ro<{
      kind: 'get'
      name: DILLocalRef
      object: DILOperand
      property: DILOperand
    }>
  | ro<{
      kind: 'call'
      name: DILLocalRef
      callee: DILOperand
      args: DILOperand[]
    }>
  | ro<{ kind: 'return'; value: DILOperand }>

const InstructionBuilders = Object.freeze({
  emit_set: (object: DILOperand, property: DILOperand, value: DILOperand) =>
    ({
      kind: 'set',
      object,
      property,
      value,
    }) as const,
  emit_get: (name: DILLocalRef, object: DILOperand, property: DILOperand) =>
    ({
      kind: 'get',
      name,
      object,
      property,
    }) as const,
  emit_make_object: (name: DILLocalRef) =>
    ({
      kind: 'make_object',
      name,
    }) as const,
  emit_call: (name: DILLocalRef, callee: DILOperand, args: DILOperand[]) =>
    ({
      kind: 'call',
      name,
      callee,
      args,
    }) as const,
  emit_return: (value: DILOperand) =>
    ({
      kind: 'return',
      value,
    }) as const,
})

type DILLocalRef = `%${string}`
type DILParamRef = `$${string}`
export type DILOperand =
  | { kind: 'local'; name: DILLocalRef }
  | { kind: 'constant'; value: DILConstant }
  | { kind: 'global'; name: GlobalRef }

export const op = Object.freeze({
  local(name: DILLocalRef): DILOperand {
    return {
      kind: 'local',
      name,
    }
  },
  global(name: GlobalRef): DILOperand {
    return {
      kind: 'global',
      name,
    }
  },
  string(value: string): DILOperand {
    return {
      kind: 'constant',
      value: {
        kind: 'string',
        value,
      },
    }
  },
  number(value: number): DILOperand {
    return {
      kind: 'constant',
      value: {
        kind: 'number',
        value,
      },
    }
  },
  boolean(value: boolean): DILOperand {
    return {
      kind: 'constant',
      value: {
        kind: 'boolean',
        value,
      },
    }
  },
})

export type DILConstant =
  | {
      kind: 'string'
      value: string
    }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }

export type BlockLabel = `.${string}`
type GlobalRef = `@${string}`
export type DILBasicBlock = {
  label: BlockLabel
  instructions: DILInstruction[]
}

export type DILType = { kind: 'top' }
export type DILParam = { name: DILParamRef; type: DILType }

export type DILFunction = {
  name: string
  params: DILParam[]
  blocks: [entry: DILBasicBlock, ...DILBasicBlock[]]
}

type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

type DILFunctionBuilder = Prettify<
  typeof op &
    InstructionEmitters & {
      add_block(name: BlockLabel): void
      emit(instruction: DILInstruction): void
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

export function localRef(name: DILLocalRef): DILOperand {
  return {
    kind: 'local',
    name,
  }
}
export function constString(value: string): DILOperand {
  return {
    kind: 'constant',
    value: {
      kind: 'string',
      value,
    },
  }
}
export function constNumber(value: number): DILOperand {
  return {
    kind: 'constant',
    value: {
      kind: 'number',
      value,
    },
  }
}
export function constBoolean(value: boolean): DILOperand {
  return {
    kind: 'constant',
    value: {
      kind: 'boolean',
      value,
    },
  }
}

export function buildFunction(
  name: GlobalRef,
  params: DILParam[],
  build: (builder: DILFunctionBuilder) => void,
): DILFunction {
  let currentBlock: DILBasicBlock = {
    label: '.entry',
    instructions: [],
  }
  const emit = (instruction: DILInstruction) => {
    currentBlock.instructions.push(instruction)
    return instruction
  }
  const e = <Args extends unknown[], I extends DILInstruction>(
    f: (...args: Args) => I,
  ) => {
    return (...args: Args) => {
      emit(f(...args))
    }
  }
  const i = InstructionBuilders
  const builder: DILFunctionBuilder = {
    add_block(name) {
      const block: DILBasicBlock = {
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
  const blocks: [DILBasicBlock, ...DILBasicBlock[]] = [currentBlock]
  return {
    name,
    params,
    blocks,
  }
}

export function prettyPrint(f: DILFunction) {
  const header = `function ${f.name}`
  const params = f.params.map(ppParam).join(', ')
  const blocks = f.blocks.map(ppBlock).join('\n')
  return `${header}(${params}) {\n${blocks}\n}`

  function ppParam(param: DILParam) {
    return `${param.name}: ${ppType(param.type)}`
  }
  function ppType(type: DILType): string {
    switch (type.kind) {
      case 'top':
        return 'top'
    }
  }
  function ppBlock(block: DILBasicBlock) {
    const instructions = block.instructions
      .map(ppInstruction)
      .map((it) => `  ${it}`)
      .join('\n')
    return `${block.label}:\n${instructions}`
  }

  function ppInstruction(instruction: DILInstruction) {
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

  function ppOperand(operand: DILOperand) {
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
  function ppConstant(constant: DILConstant) {
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
