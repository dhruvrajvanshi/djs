#pragma once

#include "./value.h"
#include <stdbool.h>

/// https://tc39.es/ecma262/#sec-sametype
bool DJS_SameType(DJSValue x, DJSValue y);

/// https://tc39.es/ecma262/#sec-isstrictlyequal
bool DJS_IsStrictlyEqual(DJSValue x, DJSValue y);
