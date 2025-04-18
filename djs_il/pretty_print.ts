import type {
  BasicBlock,
  Constant,
  Func,
  Instr,
  Op,
  Param,
  Type,
} from './il_nodes.js'

export function pretty_print(f: Func) {
  const header = `function ${f.name}`
  const params = f.params.map(ppParam).join(', ')
  const blocks = f.blocks.map(pp_block).join('\n')
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
  function pp_block(block: BasicBlock) {
    const instructions = block.instructions
      .map(pp_instr)
      .map((it) => `  ${it}`)
      .join('\n')
    return `${block.label}:\n${instructions}`
  }

  function pp_instr(instruction: Instr) {
    switch (instruction.kind) {
      case 'make_object':
        return `${instruction.name} = make_object`
      case 'set':
        return `set ${pp_operand(instruction.object)}[${pp_operand(instruction.property)}] = ${pp_operand(instruction.value)}`
      case 'get':
        return `${instruction.name} = get ${pp_operand(instruction.object)}[${pp_operand(instruction.property)}]`
      case 'call':
        return `${instruction.name} = call ${pp_operand(instruction.callee)}(${instruction.args
          .map(pp_operand)
          .join(', ')})`
      case 'return':
        return `return ${pp_operand(instruction.value)}`
      case 'jump_if':
        return `jump_if ${pp_operand(instruction.condition)} then: ${instruction.if_truthy} else: ${instruction.if_falsy}`
      default:
        assert_never(instruction)
    }
  }

  function pp_operand(operand: Op) {
    switch (operand.kind) {
      case 'local':
        return operand.name
      case 'constant':
        return pp_constant(operand.value)
      case 'global':
        return operand.name
      default:
        assert_never(operand)
    }
  }
  function pp_constant(constant: Constant) {
    switch (constant.kind) {
      case 'string':
        return JSON.stringify(constant.value)
      case 'number':
        return `${constant.value}`
      case 'boolean':
        return `${constant.value}`
      default:
        assert_never(constant)
    }
  }
}
function assert_never(x: never): never {
  throw new Error(`Unexpected object: ${x}`)
}
