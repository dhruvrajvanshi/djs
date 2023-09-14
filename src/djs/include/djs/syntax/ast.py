from .ast_utils import VariantRoot, Box, StructRoot

class Expression(VariantRoot):
  class Call:
    callee: Box['Expression']
    arguments: list['Expression']
  class Var:
     name: str

class Block(StructRoot):
  statements: list['Statement']

class Pattern(VariantRoot):
  class Identifier:
    name: str

class FormalParams(StructRoot):
  params: list[Pattern]
  rest_param: Pattern | None


class Statement(VariantRoot):
  class Return:
    value: Box['Expression'] | None

  class Function:
    name: str
    params: FormalParams
    body: Box[Block]
