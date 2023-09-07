#include "djs/OrdinaryObject.hpp"
#include "djs/Object.hpp"
#include "djs/VM.hpp"

namespace djs {

auto OrdinaryGetPrototypeOf(VM *, Object *obj) -> ValueCompletionRecord {
  return ValueCompletionRecord::normal(obj->slots.Prototype);
}

auto OrdinaryGetOwnProperty(VM *, Object *obj, PropertyKey property_key)
    -> ValueCompletionRecord {
  if (!obj->properties.contains(property_key)) {
    return ValueCompletionRecord::normal(Value::undefined());
  }
  PANIC("Unimplemented");
}

auto OrdinaryIsExtensible(VM *, Object *obj) -> CompletionRecord<bool> {
  return CompletionRecord<bool>::normal(obj->slots.Extensible);
}

} // namespace djs
