import { type ro, assert } from './util.js'

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

export function type_eq(left: Type, right: Type): boolean {
  if (left.kind !== right.kind) return false
  switch (left.kind) {
    case 'unboxed_func':
      assert(right.kind === 'unboxed_func')
      return (
        type_eq(left.returns, right.returns) &&
        left.params.length === right.params.length &&
        left.params.every((param, i) => type_eq(param, right.params[i]))
      )
    default:
      return true
  }
}
