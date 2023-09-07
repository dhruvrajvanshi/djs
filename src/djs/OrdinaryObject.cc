#include "djs/OrdinaryObject.hpp"
#include "djs/Object.hpp"
#include "djs/VM.hpp"

namespace djs {

auto OrdinaryGetPrototypeOf(VM *, Object *obj) -> ValueCompletionRecord {
  return ValueCompletionRecord::normal(obj->slots.Prototype);
}

auto OrdinaryGetOwnProperty(VM *, Object *obj, PropertyKey property_key)
    -> CompletionRecord<Opt<PropertyDescriptor>> {
  if (!obj->properties.contains(property_key)) {
    return make_normal<Opt<PropertyDescriptor>>(std::nullopt);
  }

  return make_normal<Opt<PropertyDescriptor>>(obj->properties[property_key]);
}

auto OrdinaryIsExtensible(VM *, Object *obj) -> CompletionRecord<bool> {
  return CompletionRecord<bool>::normal(obj->slots.Extensible);
}

/// https://262.ecma-international.org/14.0/#sec-validateandapplypropertydescriptor
auto ValidateAndApplyPropertyDescriptor(VM *vm, Object *o, PropertyKey k,
                                        bool extensible,
                                        PropertyDescriptor desc,
                                        Opt<PropertyDescriptor> current)
    -> CompletionRecord<bool> {
  if (!current) {
    if (!extensible)
      return CompletionRecord<bool>::normal(false);
    if (desc.IsAccessorDescriptor()) {
      TODO("AccessorProperties");
    } else {
      o->properties[k] = desc;
      return make_normal(true);
    }
  } else {
    TODO("Overwriting existing property descriptor")
  }
}

/// https://262.ecma-international.org/14.0/#sec-ordinarydefineownproperty
auto OrdinaryDefineOwnProperty(VM *vm, Object *self, PropertyKey key,
                               PropertyDescriptor descriptor)
    -> CompletionRecord<bool> {
  auto current = self->GetOwnProperty(vm, key);
  RETURN_IF_ABRUPT(current, bool);

  auto extensible = self->IsExtensible(vm);
  RETURN_IF_ABRUPT(extensible, bool);

  return ValidateAndApplyPropertyDescriptor(vm, self, key, *extensible,
                                            descriptor, *current);
}

} // namespace djs
