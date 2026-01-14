import type { SourceFile } from "djs_ast"
import { PathMap } from "./PathMap.ts"

export type SourceFiles = PathMap<SourceFile>
