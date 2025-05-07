type Type1 = ["Vec" | "Option", Type];
type Type = string | Type1;
type Tag = "span" | "visit";
type EnumVariant = {
  name: string;
  args: Record<string, Type>;
  tags: Tag[];
};
type EnumItem = {
  kind: "enum";
  name: string;
  tags: Tag[];
  variants: EnumVariant[];
};
type StructItem = {
  kind: "struct";
  name: string;
  tags: Tag[];
  fields: Record<string, Type>;
};
type Item = EnumItem | StructItem;
