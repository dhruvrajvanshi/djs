#include "djs/OrdinaryObject.hpp"
#include "djs/Object.hpp"
#include "djs/VM.hpp"

namespace djs {

auto OrdinaryGetPrototypeOf(VM *, Object *obj) -> CompletionRecord {
  return CompletionRecord::normal(obj->slots.Prototype);
}

auto OrdinaryGetOwnProperty(VM *, Object *obj, PropertyKey property_key)
    -> CompletionRecord {
  if (!obj->properties.contains(property_key)) {
    return CompletionRecord::normal(Value::undefined());
  }
  PANIC("Unimplemented");
}

auto OrdinaryIsExtensible(VM *, Object *obj) -> CompletionRecord {
  return CompletionRecord::normal(Value::boolean(obj->slots.Extensible));
}

} // namespace djs
