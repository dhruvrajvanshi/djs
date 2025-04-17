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

type DILLocalRef = `%${string}`
type DILParamRef = `$${string}`
export type DILOperand =
  | { kind: 'local'; name: DILLocalRef }
  | { kind: 'constant'; value: DILConstant }

export const op = Object.freeze({
  local(name: DILLocalRef): DILOperand {
    return {
      kind: 'local',
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

export const Instruction = Object.freeze({
  set: (object: DILOperand, property: DILOperand, value: DILOperand) =>
    ({
      kind: 'set',
      object,
      property,
      value,
    }) as const,
  get: (name: DILLocalRef, object: DILOperand, property: DILOperand) =>
    ({
      kind: 'get',
      name,
      object,
      property,
    }) as const,
  make_object: (name: DILLocalRef) =>
    ({
      kind: 'make_object',
      name,
    }) as const,
})

type AsVoidResult<T> = T extends (...args: infer Args) => unknown
  ? (...args: Args) => void
  : never

type InstructionEmitters = {
  [K in keyof typeof Instruction as `emit_${K}`]: AsVoidResult<
    (typeof Instruction)[K]
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
  const builder: DILFunctionBuilder = {
    add_block(name) {
      const block: DILBasicBlock = {
        label: name,
        instructions: [],
      }
      currentBlock = block
    },
    emit,

    emit_get: (...args) => emit(Instruction.get(...args)),
    emit_set: (...args) => emit(Instruction.set(...args)),
    emit_make_object: (...args) => emit(Instruction.make_object(...args)),
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
    }
  }

  function ppOperand(operand: DILOperand) {
    switch (operand.kind) {
      case 'local':
        return operand.name
      case 'constant':
        return ppConstant(operand.value)
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
    }
  }
}
