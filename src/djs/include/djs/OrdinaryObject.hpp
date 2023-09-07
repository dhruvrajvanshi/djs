#pragma once

#include "./CompletionRecord.hpp"
#include "./PropertyDescriptor.hpp"
#include "./PropertyKey.hpp"

namespace djs {
struct Object;
class VM;

ValueCompletionRecord OrdinaryGetPrototypeOf(VM *, Object *);
CompletionRecord<Opt<PropertyDescriptor>> OrdinaryGetOwnProperty(VM *, Object *,
                                                                 PropertyKey);
CompletionRecord<bool> OrdinaryIsExtensible(VM *, Object *);
CompletionRecord<bool> OrdinaryDefineOwnProperty(VM *, Object *, PropertyKey,
                                                 PropertyDescriptor);

} // namespace djs
