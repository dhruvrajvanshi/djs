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
  | { kind: 'local'; name: Local }
  | { kind: 'param'; name: Param }
  | { kind: 'constant'; value: Constant }
  | { kind: 'global'; name: Global }

export const Operand = Object.freeze({
  local(name: Local): Operand {
    return {
      kind: 'local',
      name,
    }
  },
  global(name: Global): Operand {
    return {
      kind: 'global',
      name,
    }
  },
  param(name: Param): Operand {
    return {
      kind: 'param',
      name,
    }
  },
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
