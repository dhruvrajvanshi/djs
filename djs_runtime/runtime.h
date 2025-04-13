#pragma once

#include <stdbool.h>
#include "./value.h"

/// https://tc39.es/ecma262/#sec-isstrictlyequal
bool DJS_IsStrictlyEqual(DJSValue left, DJSValue right);

DJSValue DJS_new_string_as_value(DJSRuntime*, const char* cstr);
const DJSString* DJS_new_string(DJSRuntime*, const char* cstr);

void djs_console_log(DJSRuntime*, DJSValue value);
