import type { ro } from './util.js'

export const Type = Object.freeze({
  js_value: { kind: 'js_value' } as const,
})

export type Type = ro<{ kind: 'js_value' }>
