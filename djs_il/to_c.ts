import type {
  BasicBlock,
  Constant,
  Func,
  Global,
  Instr,
  Operand,
  Type,
} from './il.js'
import { assert, assert_never, is_defined, todo } from './util.js'
type CName = string & { __cname: never }

type CIdent = { kind: 'ident'; name: string }
type CNode =
  | CIdent
  | { kind: 'decls'; decls: CNode[] }
  | { kind: 'block_label'; label: `.${string}` }
  | { kind: 'block'; stmts: CNode[] }
  | { kind: 'op'; op: COp; args: CNode[] }
  | { kind: 'local'; name: CIdent; type: CNode; value: CNode | null }
  | { kind: 'call'; func: CNode; args: CNode[] }
  | {
      kind: 'function_def'
      name: CIdent
      return_type: CNode
      params: CNode[]
      body: Extract<CNode, { kind: 'block' }>
    }
  | {
      kind: 'function_decl'
      name: CIdent
      return_type: CNode
      params: CNode[]
    }
  | { kind: 'param'; name: CIdent; type: CNode }
  | { kind: 'literal'; value: string }
  | { kind: 'return'; value: CNode | null }
  | { kind: 'if'; cond: CNode; then: CNode; else: CNode | null }

const ctype = {
  void: { kind: 'literal', value: 'void' },
  DJSValue: { kind: 'literal', value: 'DJSValue' },
} as const

type COp =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | '&&'
  | '||'

export function to_c(f: Func): string {
  return pp_node(to_c_node(f))
}

function to_c_node(f: Func): CNode {
  return {
    kind: 'decls',
    decls: [
      raw('#include "../../djs_runtime/djs.h"\n'),
      {
        kind: 'function_decl',
        name: cident(f.name),
        return_type: ctype.DJSValue,
        params: f.params.map((p) => ({
          kind: 'local',
          name: cident(p.name),
          type: ty_to_c(p.type),
          value: null,
        })),
      },
      {
        kind: 'function_def',
        name: cident(f.name),
        return_type: ctype.DJSValue,
        params: f.params.map((p) => ({
          kind: 'param',
          name: cident(p.name),
          type: ty_to_c(p.type),
        })),
        body: { kind: 'block', stmts: f.blocks.map(lower_block) },
      },
    ],
  }
  function lower_block(block: BasicBlock): CNode {
    return {
      kind: 'block',
      stmts: [
        block.label === '.entry'
          ? undefined
          : ({ kind: 'block_label', label: block.label } as const),
        ...block.instructions.map(lower_instr),
      ].filter(is_defined),
    }
  }
  function lower_constant(value: Constant): CNode {
    switch (value.kind) {
      case 'string':
        return raw('/* TODO: lower_constant string */')
      case 'number':
        return raw(`djs_number(${value.value})`)
      case 'boolean':
        return raw(`${value.value ? 'true' : 'false'}`)
      default:
        todo(() => `Unimplemented: ${JSON.stringify(value)}`)
    }
  }
  function lower_op(op: Operand): CNode {
    switch (op.kind) {
      case 'local':
        return cident(op.name)
      case 'constant':
        return lower_constant(op.value)
      case 'param':
        return cident(op.name)
      case 'global':
        return cident(mangle_global(op.name))
      default:
        return assert_never(op)
    }
  }
  function local_var(name: CIdent, type: CNode, value: CNode): CNode {
    return {
      kind: 'local',
      name,
      type,
      value,
    }
  }
  function if_stmt(
    cond: CNode,
    then: CNode,
    else_: CNode | null = null,
  ): CNode {
    return {
      kind: 'if',
      cond,
      then,
      else: else_ ? else_ : null,
    }
  }
  function call(f: CNode, ...args: CNode[]): CNode {
    return {
      kind: 'call',
      func: f,
      args,
    }
  }
  function lower_instr(instr: Instr): CNode {
    switch (instr.kind) {
      case 'strict_eq':
        return local_var(
          cident(instr.result),
          ctype.DJSValue,
          call(
            cident('djs_strict_eq'),
            lower_op(instr.left),
            lower_op(instr.right),
          ),
        )

      case 'or':
        return local_var(
          cident(instr.result),
          ctype.DJSValue,
          call(cident('djs_or'), lower_op(instr.left), lower_op(instr.right)),
        )
      case 'sub':
        return local_var(
          cident(instr.result),
          ctype.DJSValue,
          call(cident('djs_sub'), lower_op(instr.left), lower_op(instr.right)),
        )
      case 'add':
        return local_var(
          cident(instr.result),
          ctype.DJSValue,
          call(cident('djs_add'), lower_op(instr.left), lower_op(instr.right)),
        )
      case 'jump_if':
        return if_stmt(
          lower_op(instr.condition),
          { kind: 'block_label', label: instr.if_truthy },
          { kind: 'block_label', label: instr.if_falsy },
        )
      case 'return':
        if (instr.value) {
          return { kind: 'return', value: lower_op(instr.value) }
        }
        return { kind: 'return', value: null }
      case 'unboxed_call':
        return local_var(
          cident(instr.result),
          ctype.DJSValue,
          call(lower_op(instr.callee), ...instr.args.map(lower_op)),
        )
      case 'to_value':
        return local_var(
          cident(instr.result),
          ctype.DJSValue,
          lower_op(instr.value),
        )
      default:
        todo(() => `Unimplemented: ${instr.kind}`)
    }
  }
  function raw(text: string): CNode {
    return { kind: 'literal', value: text }
  }
  function cident(name: string): CIdent {
    return { kind: 'ident', name }
  }
  function mangle_global(name: Global): CName {
    return name.replace('@', '') as CName
  }
  function ty_to_c(ty: Type): CNode {
    assert(ty.kind === 'value', () => `Unimplemented: ${JSON.stringify(ty)}`)
    return ctype.DJSValue
  }
}

function pp(
  template: TemplateStringsArray,
  ...args: (CNode | CNode[] | string)[]
): string {
  let result = ''
  for (let i = 0; i < template.length; i++) {
    result += template[i]
    if (i < args.length) {
      const arg = args[i]
      if (typeof arg === 'string') {
        result += arg
      } else if (Array.isArray(arg)) {
        result += arg.map(pp_node).join(', ')
      } else {
        result += pp_node(arg)
      }
    }
  }
  return result
}
function pp_node(node: CNode): string {
  switch (node.kind) {
    case 'block_label':
      return `${node.label}:`
    case 'block':
      return node.stmts
        .map(pp_node)
        .map((it) => (it.startsWith('.') ? it : `  ${it}`))
        .join('\n')
    case 'op':
      return `(${node.args.map(pp_node).join(` ${node.op} `)})`
    case 'local':
      if (node.value) {
        return pp`${node.type} ${node.name} = ${node.value}`
      }
      return pp`${node.type} ${node.name}`
    case 'call':
      return pp`${node.func}(${node.args})`
    case 'function_def':
      return pp`${node.return_type} ${node.name}(${node.params}) {\n${node.body}\n}`
    case 'function_decl':
      return pp`${node.return_type} ${node.name}(${node.params});`
    case 'decls':
      return node.decls.map(pp_node).join('\n')
    case 'literal':
      return node.value
    case 'param':
      return pp`${node.type} ${node.name}`
    case 'ident':
      return mangle(node.name)
    case 'return':
      if (node.value) {
        return pp`return ${node.value};`
      }
      return 'return;'
    case 'if':
      if (node.else) {
        return pp`if (${node.cond}) goto ${node.then}; else goto ${node.else};`
      }
      return pp`if (${node.cond}) goto ${node.then};`
    default:
      return todo(() => `Unimplemented: ${JSON.stringify(node)}`)
  }
}
function mangle(name: string): string {
  let result = name.replace('@', '').replace('$', '').replace('%', '')
  if (result[0].match(/\d/)) {
    result = `_${result}`
  }
  return result
}
