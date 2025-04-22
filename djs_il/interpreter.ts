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
  const compiled_blocks = func.blocks.map((it) =>
    compile_block(it, blocks_by_name),
  )
  const compiled_blocks_by_label = obj_key_by(compiled_blocks, (it) => it.label)

  return function run() {
    const registers = new Map<Local, Value>()
    let steps = 0
    const frame: CallFrame = {
      current_instruction: 0,
      current_block: compiled_blocks[0],
      registers,
      compiled_blocks_by_label,
      should_return: false,
      return_value: undefined,
    }

    while (!frame.should_return) {
      steps++
      assert(steps < STEP_LIMIT, () => 'Step limit exceeded')
      const instr = frame.current_block.instructions[frame.current_instruction]
      instr(frame)
    }
    return frame.return_value
  }
}

function compile_block(
  block: BasicBlock,
  blocks_by_name: Record<BlockLabel, BasicBlock>,
): CompiledBlock {
  const instructions = Array.from(compile_block_gen(block, blocks_by_name))
  return { instructions, label: block.label }
}
function* compile_block_gen(
  block: BasicBlock,
  blocks_by_name: Record<BlockLabel, BasicBlock>,
): IterableIterator<CompiledInstruction> {
  for (const instr of block.instructions) {
    yield* compile_instr(blocks_by_name, instr)
  }
}

function* compile_instr(
  blocks_by_name: Record<BlockLabel, BasicBlock>,
  instr: Instr,
): IterableIterator<CompiledInstruction> {
  function i(cb: (frame: CallFrame) => void): CompiledInstruction {
    Object.defineProperty(cb, 'name', {
      value: pretty_print_instr(instr),
    })
    return cb
  }
  switch (instr.kind) {
    case 'make_object': {
      const { result } = instr
      yield i((frame) => {
        frame.registers.set(result, value_from_object({}))
        cont(frame)
      })
      break
    }
    case 'set': {
      yield i((frame) => {
        const object = eval_op(instr.object, frame)
        const property = eval_op(instr.property, frame)
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
        const value = eval_op(instr.value, frame)
        object[property] = value
        cont(frame)
      })
      break
    }
    case 'jump': {
      const { to } = instr
      yield i((frame) => {
        assert(to in blocks_by_name, () => `Unknown block: ${to}`)
        jmp(to, frame)
      })
      break
    }
    case 'get': {
      yield i((frame) => {
        const object = eval_op(instr.object, frame)
        const property = eval_op(instr.property, frame)
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

        frame.registers.set(instr.result, value)
        cont(frame)
      })
      break
    }
    case 'add': {
      yield i((frame) => {
        const left = eval_op(instr.left, frame)
        const right = eval_op(instr.right, frame)
        // TODO: Implement the JS rules for the plus operator
        if (typeof left !== 'number' || typeof right !== 'number') {
          throw new AssertionError({
            message: 'Expected number',
            actual: { left, right },
            expected: 'number',
          })
        }
        frame.registers.set(instr.result, value_from_primitive(left + right))
        cont(frame)
      })
      break
    }
    case 'strict_eq': {
      yield i((frame) => {
        frame.registers.set(
          instr.result,
          value_from_primitive(
            eval_op(instr.left, frame) === eval_op(instr.right, frame),
          ),
        )
        cont(frame)
      })
      break
    }
    case 'jump_if': {
      const { condition, if_truthy, if_falsy } = instr
      yield i((frame) => {
        if (eval_op(condition, frame)) {
          jmp(if_truthy, frame)
        } else {
          jmp(if_falsy, frame)
        }
      })
      break
    }
    case 'to_value': {
      yield i((frame) => {
        const value = eval_op(instr.value, frame)
        frame.registers.set(instr.result, value)
        cont(frame)
      })
      break
    }
    case 'return': {
      yield i((frame) => {
        const value = eval_op(instr.value, frame)
        ret(value, frame)
      })
      break
    }
    default: {
      yield i(() => {
        throw new AssertionError({
          message: `Unimplemented: ${instr.kind}`,
          actual: instr.kind,
          expected: {},
        })
      })
    }
  }
}

type CompiledInstruction = (frame: CallFrame) => void
type CallFrame = {
  registers: Map<Local, Value>
  current_instruction: number
  current_block: CompiledBlock
  compiled_blocks_by_label: Record<BlockLabel, CompiledBlock>
  should_return: boolean
  return_value: Value | undefined
}
type CompiledBlock = {
  label: BlockLabel
  instructions: CompiledInstruction[]
}
function cont(frame: CallFrame) {
  frame.current_instruction++
}
function jmp(block: BlockLabel, frame: CallFrame) {
  frame.current_block = frame.compiled_blocks_by_label[block]
  frame.current_instruction = 0
}
function ret(value: Value, frame: CallFrame) {
  frame.should_return = true
  frame.return_value = value
}
function eval_op(op: Operand, { registers }: CallFrame): Value {
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
