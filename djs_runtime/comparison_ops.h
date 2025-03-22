#pragma once

#include <stdbool.h>
#include "./value.h"

/// https://tc39.es/ecma262/#sec-sametype
bool DJS_SameType(DJSValue x, DJSValue y);

/// https://tc39.es/ecma262/#sec-samevalue
bool DJS_SameValue(DJSValue x, DJSValue y);

/// https://tc39.es/ecma262/#sec-isstrictlyequal
bool DJS_IsStrictlyEqual(DJSValue x, DJSValue y);
