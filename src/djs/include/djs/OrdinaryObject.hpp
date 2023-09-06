#pragma once

#include "./CompletionRecord.hpp"
#include "./PropertyKey.hpp"

namespace djs {
struct Object;
class VM;

CompletionRecord OrdinaryGetPrototypeOf(VM *, Object *);
CompletionRecord OrdinaryGetOwnProperty(VM *, Object *, PropertyKey);
CompletionRecord OrdinaryIsExtensible(VM *, Object *);

} // namespace djs
