import type { TypeDecl, ValueDecl } from "./decl.ts"
import { Type } from "./type.ts"

export class SymbolTable {
  readonly #values = new Map<string, ValueDecl>()
  readonly #types = new Map<string, TypeDecl>()
  readonly #exported_values = new Map<string, ValueDecl>()
  readonly #exported_types = new Map<string, TypeDecl>()
  public static readonly Global = new SymbolTable()
  static {
    // TODO initialize global symbols
    const ty = (name: string, type: Type) =>
      SymbolTable.Global.add_type(name, { kind: "Builtin", type }, true)
    ty("u8", Type.u8)
    ty("u16", Type.u16)
    ty("u32", Type.u32)
    ty("u64", Type.u64)
    ty("i8", Type.i8)
    ty("i16", Type.i16)
    ty("i32", Type.i32)
    ty("i64", Type.i64)
    ty("f32", Type.f32)
    ty("f64", Type.f64)
    ty("void", Type.void)
    ty("boolean", Type.boolean)
    ty("unknown", Type.Unknown)
  }

  get_value(name: string): ValueDecl | null {
    return this.#values.get(name) ?? null
  }
  add_value(name: string, value: ValueDecl, is_exported: boolean): void {
    this.#values.set(name, value)
    if (is_exported) {
      this.#exported_values.set(name, value)
    }
  }

  get_type(name: string): TypeDecl | null {
    return this.#types.get(name) ?? null
  }
  add_type(name: string, type: TypeDecl, is_exported: boolean): void {
    this.#types.set(name, type)
    if (is_exported) {
      this.#exported_types.set(name, type)
    }
  }
  get exported_values(): ReadonlyMap<string, ValueDecl> {
    return this.#exported_values
  }
  get exported_types(): ReadonlyMap<string, TypeDecl> {
    return this.#exported_types
  }

  get private_values(): ReadonlyMap<string, ValueDecl> {
    return this.#values
  }

  get private_types(): ReadonlyMap<string, TypeDecl> {
    return this.#types
  }
}
