#pragma once
#include "./completion.h"
#include "./value.h"

typedef struct DJSFunction DJSFunction;
typedef struct DJSRuntime DJSRuntime;

DJSFunction* DJSFunction_new(
    DJSRuntime* runtime,
    DJSCompletion (*call)(DJSRuntime*, DJSValue, DJSValue*, size_t));
