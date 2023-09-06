#pragma once

#include "./CompletionRecord.hpp"
#include "./PropertyKey.hpp"

namespace djs {
struct Object;
class VM;

ValueCompletionRecord OrdinaryGetPrototypeOf(VM *, Object *);
ValueCompletionRecord OrdinaryGetOwnProperty(VM *, Object *, PropertyKey);
ValueCompletionRecord OrdinaryIsExtensible(VM *, Object *);

} // namespace djs
