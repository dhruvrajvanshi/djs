import type { Instr } from './instructions.js'

export type BlockLabel = `.${string}`
export type BasicBlock = {
  label: BlockLabel
  instructions: Instr[]
}
