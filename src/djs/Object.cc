#include "djs/Object.hpp"
#include "djs/CompletionRecord.hpp"

namespace djs {

auto Object::Slots::ordinary() -> Slots {
  return {.Prototype = Value::null(),
          .Extensible = true,
          .GetPrototypeOf = OrdinaryGetPrototypeOf,
          .GetOwnProperty = OrdinaryGetOwnProperty,
          .DefineOwnProperty = OrdinaryDefineOwnProperty,
          .IsExtensible = OrdinaryIsExtensible};
}

auto Object::GetPrototypeOf(VM *vm) -> CompletionRecord<Value> {
  return slots.GetPrototypeOf(vm, this);
}
auto Object::GetOwnProperty(VM *vm, PropertyKey key)
    -> CompletionRecord<Opt<PropertyDescriptor>> {
  return slots.GetOwnProperty(vm, this, key);
}
auto Object::DefineOwnProperty(VM *vm, PropertyKey key,
                               PropertyDescriptor descriptor)
    -> CompletionRecord<bool> {
  return slots.DefineOwnProperty(vm, this, move(key), move(descriptor));
}
auto Object::IsExtensible(VM *vm) -> CompletionRecord<bool> {
  return slots.IsExtensible(vm, this);
}

} // namespace djs
