export type LazyType = () => string
export type Type1 = ["Vec" | "Option", Type]
export type Type = string | Type1 | LazyType
export type Tag = "span" | "visit" | "sexpr_ignore" | "trivia"
export type EnumVariant = {
  name: string
  args: Record<string, Type>
  tags: Tag[]
}
export type EnumItem = {
  kind: "enum"
  name: string
  tags: Tag[]
  variants: EnumVariant[]
}
export type StructItem = {
  kind: "struct"
  name: string
  tags: Tag[]
  fields: Record<string, { type: Type; tags: Tag[] }>
}

export type Item = EnumItem | StructItem
