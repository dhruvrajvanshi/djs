import type { ro } from './util.js'

export const Type = Object.freeze({
  value: { kind: 'value' } as const,
  boolean: { kind: 'boolean' } as const,
  number: { kind: 'number' } as const,
  string: { kind: 'string' } as const,
  object: { kind: 'object' } as const,
  undefined: { kind: 'undefined' } as const,
  null: { kind: 'null' } as const,
  unboxed_func: (returns: Type, ...params: readonly Type[]) =>
    ({ kind: 'unboxed_func', returns, params }) as const,
} satisfies { [K in Type['kind']]: unknown })

export type Type =
  | ro<{ kind: 'value' }>
  | ro<{ kind: 'boolean' }>
  | ro<{ kind: 'number' }>
  | ro<{ kind: 'string' }>
  | ro<{ kind: 'object' }>
  | ro<{ kind: 'undefined' }>
  | ro<{ kind: 'null' }>
  | ro<{ kind: 'unboxed_func'; returns: Type; params: readonly Type[] }>
