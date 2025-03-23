#pragma once

#include <stdbool.h>
#include "./object.h"
#include "./value.h"

typedef struct DJSRuntime DJSRuntime;
DJSRuntime* djs_new_runtime(void);
void djs_free_runtime(DJSRuntime*);

/// https://tc39.es/ecma262/#sec-isstrictlyequal
bool DJS_IsStrictlyEqual(DJSValue left, DJSValue right);

DJSValue DJS_new_string(DJSRuntime*, const char* cstr);

void djs_console_log(DJSRuntime*, DJSValue value);
