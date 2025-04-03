#pragma once

#include <stdbool.h>
#include "./prelude.h"
#include "./value.h"

/// https://tc39.es/ecma262/#sec-sametype
bool DJS_SameType(DJSValue x, DJSValue y);

/// https://tc39.es/ecma262/#sec-samevalue
bool DJS_SameValue(DJSValue x, DJSValue y);

/// A specialization of DJS_SameValue for Objects.
/// Just compares the pointers.
/// It's only there to ease translation from the spec
/// when it calls for SameValue(x, y) but you have 2 objects.
static inline bool DJS_SameValueObject(DJSObject* NULLABLE x,
                                       DJSObject* NULLABLE y) {
  return x == y;
}

/// https://tc39.es/ecma262/#sec-isstrictlyequal
bool DJS_IsStrictlyEqual(DJSValue x, DJSValue y);
