#pragma once
#include "./CompletionRecord.hpp"
#include "./GCBase.hpp"
#include "./OrdinaryObject.hpp"
#include "./PropertyDescriptor.hpp"
#include "./PropertyKey.hpp"
#include "./Value.hpp"

namespace djs {

class VM;

using GetPrototypeOfType = decltype(OrdinaryGetPrototypeOf) *;
using GetOwnPropertyType = decltype(OrdinaryGetOwnProperty) *;
using IsExtensibleType = decltype(OrdinaryIsExtensible) *;

struct Object : public GCBase {
  struct Slots {
    Value Prototype;
    bool Extensible;
    GetPrototypeOfType GetPrototypeOf;
    GetOwnPropertyType GetOwnProperty;
    IsExtensibleType IsExtensible;

    static auto ordinary() -> Slots;
  };

  Slots slots;
  HashMap<PropertyKey, PropertyDescriptor> properties;

  explicit Object(Slots slots) : slots(slots), properties{} {}

  ~Object() {}

  auto GetPrototypeOf(VM *) -> CompletionRecord<Value>;
  auto GetOwnProperty(VM *, PropertyKey) -> CompletionRecord<Value>;
  auto IsExtensible(VM *) -> CompletionRecord<bool>;
};

} // namespace djs
