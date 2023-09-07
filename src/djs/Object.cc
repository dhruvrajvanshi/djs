#include "djs/Object.hpp"
#include "djs/CompletionRecord.hpp"

namespace djs {

auto Object::Slots::ordinary() -> Slots {
  return {.Prototype = Value::null(),
          .Extensible = true,
          .GetPrototypeOf = OrdinaryGetPrototypeOf,
          .GetOwnProperty = OrdinaryGetOwnProperty,
          .IsExtensible = OrdinaryIsExtensible};
}

auto Object::GetPrototypeOf(VM *vm) -> CompletionRecord<Value> {
  return slots.GetPrototypeOf(vm, this);
}
auto Object::GetOwnProperty(VM *vm, PropertyKey key)
    -> CompletionRecord<Value> {
  return slots.GetOwnProperty(vm, this, key);
}
auto Object::IsExtensible(VM *vm) -> CompletionRecord<bool> {
  return slots.IsExtensible(vm, this);
}

} // namespace djs
