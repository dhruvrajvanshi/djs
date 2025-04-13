#pragma once

#include <stdbool.h>
#include "./djs_prelude.h"
#include "djs.h"

/// https://tc39.es/ecma262/#sec-sametype
bool SameType(DJSValue x, DJSValue y);

/// https://tc39.es/ecma262/#sec-samevalue
bool SameValue(DJSValue x, DJSValue y);

/// A specialization of DJS_SameValue for Objects.
/// Just compares the pointers.
/// It's only there to ease translation from the spec
/// when it calls for SameValue(x, y) but you have 2 objects.
static inline bool SameValueObject(DJSObject* NULLABLE x,
                                   DJSObject* NULLABLE y) {
  return x == y;
}

/// https://tc39.es/ecma262/#sec-isstrictlyequal
bool IsStrictlyEqual(DJSValue x, DJSValue y);
