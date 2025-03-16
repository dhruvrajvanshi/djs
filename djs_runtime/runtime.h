#pragma once

#include "./object.h"
#include "./value.h"
#include <assert.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>

typedef struct DJSCompletion {
  DJSValue value;
  bool abrupt;
} DJSCompletion;

static inline DJSCompletion DJSCompletion_normal(DJSValue value) {
  return (DJSCompletion){.value = value, .abrupt = false};
}

static inline DJSCompletion DJSCompletion_abrupt(DJSValue value) {
  return (DJSCompletion){.value = value, .abrupt = true};
}

typedef struct DJSRuntime DJSRuntime;
DJSRuntime *djs_new_runtime(void);
void djs_free_runtime(DJSRuntime *);
DJSString *djs_new_string(DJSRuntime *, const char *value);

DJSCompletion djs_object_set(DJSRuntime *, DJSObject *obj, DJSString *key,
                             DJSValue value);

DJSCompletion djs_object_get(DJSRuntime *, DJSObject *obj, DJSString *key);

/// https://tc39.es/ecma262/#sec-isstrictlyequal
bool DJS_IsStrictlyEqual(DJSValue left, DJSValue right);

void djs_console_log(DJSRuntime *, DJSValue value);
