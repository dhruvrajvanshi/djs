#pragma once

#include "./Completion.hpp"
#include "./PropertyDescriptor.hpp"
#include "./PropertyKey.hpp"
#include "dlib/Opt.hpp"

namespace djs {
struct Object;
class VM;

ValueCompletionRecord OrdinaryGetPrototypeOf(VM *, Object *);
Completion<Opt<PropertyDescriptor>> OrdinaryGetOwnProperty(VM *, Object *,
                                                           PropertyKey);
Completion<bool> OrdinaryIsExtensible(VM *, Object *);
Completion<bool> OrdinaryDefineOwnProperty(VM *, Object *, PropertyKey,
                                           PropertyDescriptor);

} // namespace djs
