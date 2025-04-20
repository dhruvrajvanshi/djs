import type {
  BasicBlock,
  Constant,
  Func,
  Instr,
  Operand,
  Param,
  Type,
} from './il.js'
import { assert_never } from './util.js'

export function pretty_print(f: Func) {
  const header = `function ${f.name}`
  const params = f.params.map(pp_param).join(', ')
  const blocks = f.blocks.map(pp_block).join('\n')
  return `${header}(${params}) {\n${blocks}\n}`

  function pp_param(param: { name: Param; type: Type }) {
    return `${param.name}: ${pretty_print_type(param.type)}`
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
        return `${instr.result} = make_object`
      case 'set':
        return pp`set ${instr.object}[${instr.property}] = ${instr.value}`
      case 'get':
        return pp`${instr.result} = get ${instr.object}[${instr.property}]`
      case 'unboxed_call':
        return pp`${instr.result} = unboxed_call ${instr.callee}(${instr.args})`
      case 'return':
        return pp`return ${instr.value}`
      case 'jump_if':
        return pp`jump_if ${instr.condition} then: ${instr.if_truthy} else: ${instr.if_falsy}`
      case 'or':
        return pp`${instr.result} = or ${instr.left}, ${instr.right}`
      case 'strict_eq':
        return pp`${instr.result} = strict_eq ${instr.left}, ${instr.right}`
      case 'add':
        return pp`${instr.result} = add ${instr.left}, ${instr.right}`
      case 'sub':
        return pp`${instr.result} = sub ${instr.left}, ${instr.right}`
      case 'to_value':
        return pp`${instr.result} = to_value ${instr.value}`
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
export function pretty_print_type(type: Type): string {
  switch (type.kind) {
    case 'value':
      return 'value'
    case 'object':
      return 'object'
    case 'null':
      return 'null'
    case 'undefined':
      return 'undefined'
    case 'boolean':
      return 'boolean'
    case 'number':
      return 'number'
    case 'string':
      return 'string'
    case 'unboxed_func': {
      const params = type.params.map(pretty_print_type).join(', ')
      const ret = pretty_print_type(type.returns)
      return `#(${params}) => ${ret}`
    }
    default:
      assert_never(type)
  }
}
