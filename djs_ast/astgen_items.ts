export type LazyType = () => Type
export type Type1 = ["Vec" | "Option", Type]
export type Type = string | Type1 | LazyType | StructItem | EnumItem
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

export function is_item(ty: Type): ty is Item {
  return (
    typeof ty === "object" &&
    ty !== null &&
    !Array.isArray(ty) &&
    "name" in ty &&
    "kind" in ty
  )
}
