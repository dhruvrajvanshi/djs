import { assert, assert_never, obj_key_by, todo } from './util.js'
import type { Func } from './func.js'
import type { BlockLabel, BasicBlock } from './basic_block.js'
import type { Instr } from './instructions.js'
import type { Local, Operand } from './operand.js'
import { AssertionError } from 'node:assert'
import { pretty_print_instr } from './pretty_print.js'

const STEP_LIMIT = 1000

export function interpret(func: Func) {
  const compiled = compile(func)
  return compiled()
}
function compile(func: Func) {
  if (func.params.length > 0) {
    todo()
  }
  const blocks_by_name = obj_key_by(func.blocks, (it) => it.label)

  return function run() {
    const compiled_blocks = func.blocks.map(compile_block)
    const compiled_blocks_by_label = obj_key_by(
      compiled_blocks,
      (it) => it.label,
    )
    type CompiledInstruction = () => void

    const registers = new Map<Local, Value>()
    type CompiledBlock = {
      label: BlockLabel
      instructions: CompiledInstruction[]
    }

    let current_block = compiled_blocks[0]
    let current_instruction = 0
    let steps = 0
    function cont() {
      current_instruction++
    }
    function jmp(block: BlockLabel) {
      current_block = compiled_blocks_by_label[block]
      current_instruction = 0
    }
    function ret(value: Value) {
      throw new Return(value)
    }
    class Return {
      constructor(public value: Value) {}
    }
    try {
      while (true) {
        steps++
        assert(steps < STEP_LIMIT, () => 'Step limit exceeded')
        const instr = current_block.instructions[current_instruction]
        instr()
      }
    } catch (e) {
      if (e instanceof Return) {
        return e.value
      }
      throw e
    }

    function compile_block(block: BasicBlock): CompiledBlock {
      const instructions = Array.from(compile_block_gen(block))
      return { instructions, label: block.label }
    }
    function* compile_block_gen(
      block: BasicBlock,
    ): IterableIterator<CompiledInstruction> {
      for (const instr of block.instructions) {
        yield* compile_instr(instr)
      }
    }
    function* compile_instr(
      instr: Instr,
    ): IterableIterator<CompiledInstruction> {
      switch (instr.kind) {
        case 'make_object': {
          const { result } = instr
          const f = () => {
            registers.set(result, value_from_object({}))
            cont()
          }
          Object.defineProperty(f, 'name', {
            value: pretty_print_instr(instr),
          })
          yield f
          break
        }
        case 'set': {
          const f = () => {
            const object = eval_op(instr.object)
            const property = eval_op(instr.property)
            if (typeof object !== 'object') {
              throw new AssertionError({
                message: 'Expected object',
                actual: typeof object,
                expected: 'object',
              })
            }
            if (typeof property !== 'string') {
              throw new AssertionError({
                message: 'Expected string',
                actual: property,
                expected: 'string',
              })
            }
            const value = eval_op(instr.value)
            object[property] = value
            cont()
          }
          Object.defineProperty(f, 'name', {
            value: pretty_print_instr(instr),
          })
          yield f
          break
        }
        case 'jump': {
          const { to } = instr
          const jump = () => {
            assert(to in blocks_by_name, () => `Unknown block: ${to}`)
            jmp(to)
          }
          Object.defineProperty(jump, 'name', {
            value: pretty_print_instr(instr),
          })
          yield jump
          break
        }
        case 'get': {
          const get = () => {
            const object = eval_op(instr.object)
            const property = eval_op(instr.property)
            if (object === null || typeof object !== 'object') {
              throw new AssertionError({
                message: 'Expected object',
                actual: typeof object,
                expected: 'object',
              })
            }
            if (typeof property !== 'string') {
              throw new AssertionError({
                message: 'Expected string',
                actual: property,
                expected: 'string',
              })
            }
            const value = object[property]

            registers.set(instr.result, value)
            cont()
          }
          Object.defineProperty(get, 'name', {
            value: pretty_print_instr(instr),
          })
          yield get
          break
        }
        case 'add': {
          const add = () => {
            const left = eval_op(instr.left)
            const right = eval_op(instr.right)
            // TODO: Implement the JS rules for the plus operator
            if (typeof left !== 'number' || typeof right !== 'number') {
              throw new AssertionError({
                message: 'Expected number',
                actual: { left, right },
                expected: 'number',
              })
            }
            registers.set(instr.result, value_from_primitive(left + right))
            cont()
          }
          Object.defineProperty(add, 'name', {
            value: pretty_print_instr(instr),
          })
          yield add
          break
        }
        case 'strict_eq': {
          const strict_eq = () => {
            registers.set(
              instr.result,
              value_from_primitive(
                eval_op(instr.left) === eval_op(instr.right),
              ),
            )
            cont()
          }
          Object.defineProperty(strict_eq, 'name', {
            value: pretty_print_instr(instr),
          })
          yield strict_eq
          break
        }
        case 'jump_if': {
          const { condition, if_truthy, if_falsy } = instr
          const jump_if = () => {
            if (eval_op(condition)) {
              jmp(if_truthy)
            } else {
              jmp(if_falsy)
            }
          }
          Object.defineProperty(jump_if, 'name', {
            value: pretty_print_instr(instr),
          })
          yield jump_if
          break
        }
        case 'to_value': {
          const to_value = () => {
            const value = eval_op(instr.value)
            registers.set(instr.result, value)
            cont()
          }
          Object.defineProperty(to_value, 'name', {
            value: pretty_print_instr(instr),
          })
          yield to_value
          break
        }
        case 'return': {
          const return_ = () => {
            const value = eval_op(instr.value)
            ret(value)
          }
          Object.defineProperty(return_, 'name', {
            value: pretty_print_instr(instr),
          })
          yield return_
          break
        }
        default: {
          const unimplemented = () => {
            throw new AssertionError({
              message: `Unimplemented: ${instr.kind}`,
              actual: instr.kind,
              expected: {},
            })
          }
          Object.defineProperty(unimplemented, 'name', {
            value: `#unimplemented: ${pretty_print_instr(instr)}`,
          })
          yield unimplemented
        }
      }
    }

    function eval_op(op: Operand): Value {
      switch (op.kind) {
        case 'local': {
          const value = registers.get(op.name)
          if (!registers.has(op.name)) {
            throw new AssertionError({
              message: `Local ${op.name} not found`,
              actual: null,
              expected: {},
            })
          }
          return value_from_primitive(value)
        }
        case 'constant':
          return value_from_primitive(op.value.value)
        case 'param':
          return todo()
        case 'global':
          return todo()
        default:
          assert_never(op)
      }
    }
  }
}

function value_from_primitive(
  value: string | number | boolean | null | undefined | Value,
): Value {
  return value as Value
}
function value_from_object(value: object): Value {
  return value as Value
}

type Value = { __brand: 'interpreter_value' | undefined } & (
  | string
  | number
  | boolean
  | undefined
  | null
  | { [K: PropertyKey]: Value }
)
