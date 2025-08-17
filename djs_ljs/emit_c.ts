import type { SourceFiles } from "./SourceFiles.ts"
import { todo } from "djs_std"
import { type TypecheckResult } from "./typecheck.ts"
import type { ResolveImportsResult } from "./resolve_imports.ts"

/**
 * @returns C source code
 */
export function emit_c(
  source_files: SourceFiles,
  tc_result: TypecheckResult,
  resolve_result: ResolveImportsResult,
): string {
  todo()
}

export type CNode =
  | { kind: "Ident"; name: string }
  | { kind: "Block"; body: CNode[] }
  | { kind: "Concat"; items: CNode[] }
  | { kind: "LineComment"; text: string }
  | {
      kind: "FuncForwardDecl"
      name: string
      params: CNode[]
      returns: CNode
    }
  | { kind: "Param"; name: string; type: CNode }
  | { kind: "ConstPtr"; to_type: CNode }
  | { kind: "Ptr"; to_type: CNode }
  | { kind: "VarDecl"; type: CNode; name: string; init: CNode }
  | {
      kind: "FuncDef"
      name: string
      params: CNode[]
      returns: CNode
      body: CNode
    }
  | { kind: "ExternFunc"; name: string; params: CNode[]; returns: CNode }
  | { kind: "Return"; value: CNode | null }
  | { kind: "Call"; func: CNode; args: CNode[] }
  | { kind: "StringLiteral"; value: string }
  | { kind: "IntLiteral"; value: number }
