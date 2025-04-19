import type {
  BasicBlock,
  Constant,
  Func,
  Instr,
  Operand,
  Param,
  Type,
} from './il_nodes.js'
import { assert_never } from './util.js'

export function pretty_print(f: Func) {
  const header = `function ${f.name}`
  const params = f.params.map(pp_param).join(', ')
  const blocks = f.blocks.map(pp_block).join('\n')
  return `${header}(${params}) {\n${blocks}\n}`

  function pp_param(param: { name: Param; type: Type }) {
    return `${param.name}: ${pp_type(param.type)}`
  }
  function pp_type(type: Type): string {
    switch (type.kind) {
      case 'js_value':
        return 'JSValue'
    }
  }
  function pp_block(block: BasicBlock) {
    const instructions = block.instructions
      .map(pp_instr)
      .map((it) => `  ${it}`)
      .join('\n')
    return `${block.label}:\n${instructions}`
  }

  type PP = string | Operand | PP[]
  function pp(template: TemplateStringsArray, ...args: PP[]) {
    let result = ''
    for (let i = 0; i < Math.max(template.length, args.length); i++) {
      const str = template[i]
      const arg = args[i]
      result += str
      if (arg) result += pp_pp(arg)
    }
    return result
  }
  function pp_pp(arg: PP): string {
    if (typeof arg === 'string') {
      return arg
    }
    if (Array.isArray(arg)) {
      return arg.map(pp_pp).join(', ')
    }
    return pp_operand(arg)
  }

  function pp_instr(instr: Instr) {
    switch (instr.kind) {
      case 'make_object':
        return `${instr.name} = make_object`
      case 'set':
        return pp`set ${instr.object}[${instr.property}] = ${instr.value}`
      case 'get':
        return pp`${instr.name} = get ${instr.object}[${instr.property}]`
      case 'call':
        return pp`${instr.name} = call ${instr.callee}(${instr.args})`
      case 'return':
        return pp`return ${instr.value}`
      case 'jump_if':
        return pp`jump_if ${instr.condition} then: ${instr.if_truthy} else: ${instr.if_falsy}`
      case 'or':
        return pp`${instr.name} = or ${instr.left}, ${instr.right}`
      case 'strict_eq':
        return pp`${instr.name} = strict_eq ${instr.left}, ${instr.right}`
      case 'add':
        return pp`${instr.name} = add ${instr.left}, ${instr.right}`
      case 'sub':
        return pp`${instr.name} = sub ${instr.left}, ${instr.right}`
      default:
        assert_never(instr)
    }
  }

  function pp_operand(operand: Operand) {
    switch (operand.kind) {
      case 'local':
        return operand.name
      case 'constant':
        return pp_constant(operand.value)
      case 'global':
        return operand.name
      case 'param':
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
