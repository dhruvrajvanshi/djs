import type { BlockLabel } from './basic_block.js'
import type { Local, Operand } from './operand.js'
import type { ro } from './util.js'

export type Instr =
  | ro<{ kind: 'make_object'; result: Local }>
  | ro<{
      kind: 'set'
      object: Operand
      property: Operand
      value: Operand
    }>
  | ro<{
      kind: 'get'
      result: Local
      object: Operand
      property: Operand
    }>
  | ro<{
      kind: 'strict_eq'
      result: Local
      left: Operand
      right: Operand
    }>
  | ro<{
      kind: 'or'
      result: Local
      left: Operand
      right: Operand
    }>
  | ro<{
      kind: 'add'
      result: Local
      left: Operand
      right: Operand
    }>
  | ro<{
      kind: 'sub'
      result: Local
      left: Operand
      right: Operand
    }>
  | ro<{
      kind: 'call'
      result: Local
      callee: Operand
      args: Operand[]
    }>
  | ro<{ kind: 'return'; value: Operand }>
  | ro<{
      kind: 'jump_if'
      condition: Operand
      if_truthy: BlockLabel
      if_falsy: BlockLabel
    }>

export const Instr = {
  emit_set: (object: Operand, property: Operand, value: Operand) =>
    ({
      kind: 'set',
      object,
      property,
      value,
    }) as const,
  emit_get: (name: Local, object: Operand, property: Operand) =>
    ({
      kind: 'get',
      result: name,
      object,
      property,
    }) as const,
  emit_make_object: (name: Local) =>
    ({
      kind: 'make_object',
      result: name,
    }) as const,
  emit_call: (name: Local, callee: Operand, args: Operand[]) =>
    ({
      kind: 'call',
      result: name,
      callee,
      args,
    }) as const,
  emit_return: (value: Operand) =>
    ({
      kind: 'return',
      value,
    }) as const,
  emit_jump_if: (
    condition: Operand,
    if_truthy: BlockLabel,
    if_falsy: BlockLabel,
  ) => ({
    kind: 'jump_if',
    condition,
    if_truthy,
    if_falsy,
  }),
  emit_strict_eq: (name: Local, left: Operand, right: Operand) =>
    ({
      kind: 'strict_eq',
      result: name,
      left,
      right,
    }) as const,
  emit_or: (name: Local, left: Operand, right: Operand) =>
    ({
      kind: 'or',
      result: name,
      left,
      right,
    }) as const,
  emit_add: (name: Local, left: Operand, right: Operand) =>
    ({
      kind: 'add',
      result: name,
      left,
      right,
    }) as const,
  emit_sub: (name: Local, left: Operand, right: Operand) =>
    ({
      kind: 'sub',
      result: name,
      left,
      right,
    }) as const,
} as const satisfies {
  [K in `emit_${Instr['kind']}`]: (...args: never[]) => Instr
}
