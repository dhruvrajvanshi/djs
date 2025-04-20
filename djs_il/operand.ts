import type { Type } from './type.js'

export type Constant =
  | {
      kind: 'string'
      value: string
    }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
export type Local = `%${string}`
export type Param = `$${string}`
export type Global = `@${string}`
export type Operand =
  | { kind: 'local'; name: Local; type: Type }
  | { kind: 'param'; name: Param; type: Type }
  | { kind: 'constant'; value: Constant }
  | { kind: 'global'; name: Global; type: Type }

export const Operand = Object.freeze({
  local: (name: Local, type: Type): Operand => ({
    kind: 'local',
    name,
    type,
  }),
  global: (name: Global, type: Type): Operand => ({
    kind: 'global',
    name,
    type,
  }),
  param: (name: Param, type: Type): Operand => ({
    kind: 'param',
    name,
    type,
  }),
  string(value: string): Operand {
    return {
      kind: 'constant',
      value: {
        kind: 'string',
        value,
      },
    }
  },
  number(value: number): Operand {
    return {
      kind: 'constant',
      value: {
        kind: 'number',
        value,
      },
    }
  },
  boolean(value: boolean): Operand {
    return {
      kind: 'constant',
      value: {
        kind: 'boolean',
        value,
      },
    }
  },
})
