export type DILInstruction =
  | { kind: 'make_basic_object'; name: DILRegister }
  | { kind: 'set'; DILRegister: string; lhs: DILOperand; rhs: DILOperand }
  | { kind: 'get'; DILRegister: string; lhs: DILOperand; rhs: DILOperand }

export type DILRegister = string

export type DILOperand =
  | { kind: 'local'; name: string }
  | { kind: 'constant'; value: DILConstant }

export type DILConstant =
  | {
      kind: 'string'
      value: string
    }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }

export type DILBasicBlock = {
  params: DILParam[]
  instructions: DILInstruction[]
}

export type DILType = { kind: 'top' }
export type DILParam = { name: string; type: DILType }

export type DILFunction = {
  name: string
  params: DILParam[]
  blocks: DILBasicBlock[]
}
