#include "djs/Object.hpp"
#include "djs/Completion.hpp"

namespace djs {

auto Object::Slots::ordinary() -> Slots {
  return {.Prototype = Value::null(),
          .Extensible = true,
          .GetPrototypeOf = OrdinaryGetPrototypeOf,
          .GetOwnProperty = OrdinaryGetOwnProperty,
          .DefineOwnProperty = OrdinaryDefineOwnProperty,
          .IsExtensible = OrdinaryIsExtensible};
}

auto Object::GetPrototypeOf(VM *vm) -> Completion<Value> {
  return slots.GetPrototypeOf(vm, this);
}
auto Object::GetOwnProperty(VM *vm, PropertyKey key)
    -> Completion<Opt<PropertyDescriptor>> {
  return slots.GetOwnProperty(vm, this, key);
}
auto Object::DefineOwnProperty(VM *vm, PropertyKey key,
                               PropertyDescriptor descriptor)
    -> Completion<bool> {
  return slots.DefineOwnProperty(vm, this, std::move(key),
                                 std::move(descriptor));
}
auto Object::IsExtensible(VM *vm) -> Completion<bool> {
  return slots.IsExtensible(vm, this);
}

} // namespace djs
