from .ast_utils import TreeRoot, Box

class Expression(TreeRoot):
  class Call:
    callee: Box['Expression']
    arguments: list['Expression']
  class Var:
     name: str

class Statement(TreeRoot):
  class Return:
    value: Box['Expression'] | None
