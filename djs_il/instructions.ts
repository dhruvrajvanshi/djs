import type { BlockLabel } from './basic_block.js'
import type { Local, Operand } from './operand.js'
import type { ro, StringUnionDiff } from './util.js'

const SSAInstrKinds = [
  'get',
  'strict_eq',
  'or',
  'add',
  'sub',
  'unboxed_call',
  'make_object',
] as const satisfies readonly Instr['kind'][]
type SSAInstrKinds = (typeof SSAInstrKinds)[number]
type InstrWithKind<K extends Instr['kind']> = Extract<Instr, { kind: K }>

export type SSAInstr = InstrWithKind<SSAInstrKinds>

export function is_ssa_instr(instr: Instr): instr is SSAInstr {
  return SSAInstrKinds.includes(instr.kind as SSAInstrKinds)
}

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
      kind: 'unboxed_call'
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
  set: (object: Operand, property: Operand, value: Operand) =>
    ({
      kind: 'set',
      object,
      property,
      value,
    }) as const,
  get: (name: Local, object: Operand, property: Operand) =>
    ({
      kind: 'get',
      result: name,
      object,
      property,
    }) as const,
  make_object: (name: Local) =>
    ({
      kind: 'make_object',
      result: name,
    }) as const,
  unboxed_call: (name: Local, callee: Operand, args: Operand[]) =>
    ({
      kind: 'unboxed_call',
      result: name,
      callee,
      args,
    }) as const,
  return: (value: Operand) =>
    ({
      kind: 'return',
      value,
    }) as const,
  jump_if: (
    condition: Operand,
    if_truthy: BlockLabel,
    if_falsy: BlockLabel,
  ) => ({
    kind: 'jump_if',
    condition,
    if_truthy,
    if_falsy,
  }),
  strict_eq: (name: Local, left: Operand, right: Operand) =>
    ({
      kind: 'strict_eq',
      result: name,
      left,
      right,
    }) as const,
  or: (name: Local, left: Operand, right: Operand) =>
    ({
      kind: 'or',
      result: name,
      left,
      right,
    }) as const,
  add: (name: Local, left: Operand, right: Operand) =>
    ({
      kind: 'add',
      result: name,
      left,
      right,
    }) as const,
  sub: (name: Local, left: Operand, right: Operand) =>
    ({
      kind: 'sub',
      result: name,
      left,
      right,
    }) as const,
} as const satisfies {
  [K in Instr['kind']]: (...args: never[]) => Extract<Instr, { kind: K }>
}

type InstrWithResult = Extract<Instr, { result: Local }>
export const internal_type_assertions = {
  ssa_instr_kinds_assertion: { kind: 'get' } satisfies Partial<
    InstrWithResult extends InstrWithKind<SSAInstrKinds>
      ? InstrWithKind<SSAInstrKinds>
      : `ERROR: Missing value in SSAInstrKinds: ${StringUnionDiff<
          InstrWithResult['kind'],
          SSAInstrKinds
        >}`
  >,
}
