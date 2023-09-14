from typing import TypeVar, Generic

T = TypeVar('T')
class Box(Generic[T]): pass

class VariantRoot:
  @classmethod
  def classes(cls: type) -> list[type]:
    return [t for t in cls.__dict__.values() if isinstance(t, type)]

class StructRoot:
  @classmethod
  def fields(cls: type) -> dict[str, type]:
    return cls.__annotations__
